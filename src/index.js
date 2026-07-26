require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const connectDB = require('./config/db');
const Agent = require('./models/Agent');
const Session = require('./models/Session');
const KBItem = require('./models/KBItem');
const Setting = require('./models/Setting');
const { addDocument, queryKnowledgeBase } = require('./services/rag');
const { getBusinessHours, updateBusinessHours } = require('./services/businessHours');
const initSocket = require('./socket');

const app = express();
const server = http.createServer(app);

// Connect to Database
connectDB().then(() => {
  seedAdmin();
});

// Seed default admin account if none exists
async function seedAdmin() {
  try {
    const count = await Agent.countDocuments();
    if (count === 0) {
      // Default admin account
      await Agent.create({
        username: 'admin',
        password: 'password123', // Hashed automatically by mongoose schema hook
        role: 'admin'
      });
      console.log('---');
      console.log('Seeded initial admin account!');
      console.log('Username: admin');
      console.log('Password: password123');
      console.log('---');
    }
  } catch (err) {
    console.error("Error seeding admin agent:", err.message);
  }
}

// Middleware
app.use(cors());
app.use(express.json());

// Serve static UI assets
app.use(express.static(path.join(__dirname, '../public')));

// Root redirect → dashboard
app.get('/', (req, res) => {
  res.redirect('/dashboard/index.html');
});

// Authentication Middleware
const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'super-secret-livedesk-token-key-2026');
      req.agent = await Agent.findById(decoded.id).select('-password');
      if (!req.agent) {
        return res.status(401).json({ message: 'Not authorized, agent not found' });
      }
      next();
    } catch (error) {
      res.status(401).json({ message: 'Not authorized, invalid token' });
    }
  } else {
    res.status(401).json({ message: 'Not authorized, no token provided' });
  }
};

// --- REST API ENDPOINTS ---

// Admin Register new Agent
app.post('/api/auth/register', protect, async (req, res) => {
  const { username, password, role } = req.body;
  if (req.agent.role !== 'admin') {
    return res.status(403).json({ message: 'Only admin accounts can register new agents' });
  }

  try {
    const agentExists = await Agent.findOne({ username });
    if (agentExists) {
      return res.status(400).json({ message: 'Agent username already exists' });
    }

    const newAgent = await Agent.create({ username, password, role });
    res.status(201).json({
      id: newAgent._id,
      username: newAgent.username,
      role: newAgent.role
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Agent Login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const agent = await Agent.findOne({ username });
    if (agent && (await agent.matchPassword(password))) {
      const token = jwt.sign(
        { id: agent._id },
        process.env.JWT_SECRET || 'super-secret-livedesk-token-key-2026',
        { expiresIn: '30d' }
      );

      res.json({
        token,
        agent: {
          id: agent._id,
          username: agent.username,
          role: agent.role
        }
      });
    } else {
      res.status(401).json({ message: 'Invalid username or password' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get self info
app.get('/api/auth/me', protect, async (req, res) => {
  res.json(req.agent);
});

// Knowledge Base: List unique documents (by grouping titles)
app.get('/api/kb', protect, async (req, res) => {
  const { projectId } = req.query;
  const pid = projectId || 'default';
  try {
    const documents = await KBItem.aggregate([
      { $match: { projectId: pid } },
      {
        $group: {
          _id: "$title",
          chunksCount: { $sum: 1 },
          createdAt: { $first: "$createdAt" }
        }
      },
      { $sort: { createdAt: -1 } }
    ]);
    res.json(documents);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Knowledge Base: Add document content (processes vector chunk embedding)
app.post('/api/kb', protect, async (req, res) => {
  const { title, content, projectId } = req.body;
  const pid = projectId || 'default';
  if (!title || !content) {
    return res.status(400).json({ message: 'Title and content are required' });
  }

  try {
    console.log(`Processing knowledge base document: "${title}" for project "${pid}"...`);
    await addDocument(title, content, pid);
    res.status(201).json({ message: 'Document added and indexed successfully' });
  } catch (error) {
    console.error("KB upload failed:", error);
    res.status(500).json({ message: error.message });
  }
});

// Knowledge Base: Delete all chunks of a document by title
app.delete('/api/kb', protect, async (req, res) => {
  const { title, projectId } = req.body;
  const pid = projectId || 'default';
  if (!title) {
    return res.status(400).json({ message: 'Document title is required' });
  }

  try {
    const result = await KBItem.deleteMany({ title, projectId: pid });
    res.json({ message: `Successfully deleted document "${title}" (${result.deletedCount} chunks removed)` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Settings: Get business hours configuration
app.get('/api/settings/business-hours', protect, async (req, res) => {
  const { projectId } = req.query;
  const pid = projectId || 'default';
  try {
    const hours = await getBusinessHours(pid);
    res.json(hours);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Settings: Get widget branding configuration
app.get('/api/settings/branding', protect, async (req, res) => {
  const { projectId } = req.query;
  const pid = projectId || 'default';
  const defaultBranding = { chatbotName: 'AI Chatbot', teamSubtitle: 'Support Representative' };
  try {
    let doc = await Setting.findOne({ key: 'widget_branding', projectId: pid });
    if (!doc) {
      try {
        doc = await Setting.create({
          key: 'widget_branding',
          projectId: pid,
          value: defaultBranding
        });
      } catch (err) {
        doc = await Setting.findOne({ key: 'widget_branding', projectId: pid });
      }
    }
    res.json(doc ? doc.value : defaultBranding);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Settings: Update widget branding configuration
app.post('/api/settings/branding', protect, async (req, res) => {
  const { projectId, branding } = req.body;
  const pid = projectId || 'default';
  try {
    let doc = await Setting.findOne({ key: 'widget_branding', projectId: pid });
    if (!doc) {
      doc = new Setting({ key: 'widget_branding', projectId: pid });
    }
    doc.value = branding;
    await doc.save();
    res.json(doc.value);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Settings: Update business hours configuration
app.post('/api/settings/business-hours', protect, async (req, res) => {
  const { projectId, hours } = req.body;
  const pid = projectId || 'default';
  try {
    const updated = await updateBusinessHours(hours, pid);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Projects: Get list of all projects
app.get('/api/projects', protect, async (req, res) => {
  try {
    let doc = await Setting.findOne({ key: 'projects_list' });
    if (!doc) {
      doc = await Setting.create({
        key: 'projects_list',
        value: [{ id: 'default', name: 'Default Project' }]
      });
    }
    res.json(doc.value);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Projects: Create a new project
app.post('/api/projects', protect, async (req, res) => {
  const { name } = req.body;
  if (!name || name.trim() === '') {
    return res.status(400).json({ message: 'Project name is required' });
  }

  try {
    let doc = await Setting.findOne({ key: 'projects_list' });
    if (!doc) {
      doc = new Setting({
        key: 'projects_list',
        value: [{ id: 'default', name: 'Default Project' }]
      });
    }
    
    const newId = 'project_' + Math.random().toString(36).substring(2, 9);
    const updatedList = [...doc.value, { id: newId, name: name.trim() }];
    doc.value = updatedList;
    doc.markModified('value');
    await doc.save();
    
    res.status(201).json(updatedList);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Analytics: Get metrics for a specific project
app.get('/api/analytics', protect, async (req, res) => {
  const { projectId, range } = req.query; // range = 'weekly' | 'monthly'
  const pid = projectId || 'default';
  
  try {
    const activeCount = await Session.countDocuments({ projectId: pid, status: { $in: ['active', 'bot'] } });
    const totalVisits = await Session.countDocuments({ projectId: pid });
    const totalChats = await Session.countDocuments({ projectId: pid }); // simple total mapping for metrics

    // Chart Data Trend
    const daysCount = range === 'monthly' ? 30 : 7;
    const chartData = [];
    const now = new Date();
    
    for (let i = daysCount - 1; i >= 0; i--) {
      const startOfDay = new Date(now);
      startOfDay.setDate(now.getDate() - i);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(now);
      endOfDay.setDate(now.getDate() - i);
      endOfDay.setHours(23, 59, 59, 999);
      
      const count = await Session.countDocuments({
        projectId: pid,
        createdAt: { $gte: startOfDay, $lte: endOfDay }
      });
      
      // Format as "Mon" for weekly or "M/D" for monthly
      const label = range === 'monthly'
        ? startOfDay.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })
        : startOfDay.toLocaleDateString(undefined, { weekday: 'short' });
        
      chartData.push({ label, count });
    }
    
    res.json({
      activeCount,
      totalVisits,
      totalChats,
      chartData
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Initialize Socket.io Connection
initSocket(server);

// Start the Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`LiveDesk server running on port ${PORT}`);
});
