const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, 'bank-logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

module.exports.logBankError = async (error, context = {}) => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    error: {
      message: error.message,
      stack: error.stack,
      code: error.code
    },
    response: error.response?.data,
    request: error.config?.data,
    context
  };

  const logFile = path.join(logDir, `errors_${new Date().toISOString().split('T')[0]}.json`);
  
  try {
    let logs = [];
    if (fs.existsSync(logFile)) {
      logs = JSON.parse(fs.readFileSync(logFile));
    }
    logs.push(logEntry);
    fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
  } catch (writeError) {
    console.error('Failed to write error log:', writeError);
  }
};
