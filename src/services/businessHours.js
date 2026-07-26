const Setting = require('../models/Setting');

// Default configuration
const DEFAULT_HOURS = {
  enabled: false, // Default is disabled (always open)
  timezone: 'America/New_York',
  start: '09:00',
  end: '17:00',
  days: [1, 2, 3, 4, 5], // Monday to Friday (1=Mon, 5=Fri, 0=Sun, 6=Sat)
};

async function getBusinessHours(projectId = 'default') {
  try {
    let doc = await Setting.findOne({ key: 'business_hours', projectId });
    if (!doc) {
      try {
        doc = await Setting.create({ key: 'business_hours', projectId, value: DEFAULT_HOURS });
      } catch (e) {
        // Handle concurrency or duplicate key race condition
        doc = await Setting.findOne({ key: 'business_hours', projectId });
      }
    }
    return doc ? doc.value : DEFAULT_HOURS;
  } catch (err) {
    console.error("Error fetching business hours:", err);
    return DEFAULT_HOURS;
  }
}

async function updateBusinessHours(value, projectId = 'default') {
  let doc = await Setting.findOne({ key: 'business_hours', projectId });
  if (!doc) {
    doc = new Setting({ key: 'business_hours', projectId });
  }
  doc.value = { ...DEFAULT_HOURS, ...value };
  await doc.save();
  return doc.value;
}

const WEEKDAY_MAP = {
  'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6
};

function isWithinBusinessHours(settings, date = new Date()) {
  if (!settings || !settings.enabled) {
    return true; // Always open if business hours are disabled
  }

  try {
    const tz = settings.timezone || 'UTC';
    
    // Format weekday in timezone
    const weekdayStr = date.toLocaleDateString('en-US', { timeZone: tz, weekday: 'short' });
    const localDay = WEEKDAY_MAP[weekdayStr];
    
    // Check if local day is in active days
    if (!settings.days.includes(localDay)) {
      return false;
    }

    // Format local time "HH:MM"
    const timeStr = date.toLocaleTimeString('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    const [currentHour, currentMin] = timeStr.split(':').map(Number);
    const [startHour, startMin] = settings.start.split(':').map(Number);
    const [endHour, endMin] = settings.end.split(':').map(Number);

    const currentTotalMin = currentHour * 60 + currentMin;
    const startTotalMin = startHour * 60 + startMin;
    const endTotalMin = endHour * 60 + endMin;

    return currentTotalMin >= startTotalMin && currentTotalMin <= endTotalMin;
  } catch (e) {
    console.error("Error checking business hours:", e);
    return true;
  }
}

module.exports = {
  getBusinessHours,
  updateBusinessHours,
  isWithinBusinessHours
};
