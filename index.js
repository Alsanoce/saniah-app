require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { parseStringPromise } = require('xml2js');
const admin = require('firebase-admin');
const cors = require('cors');
const winston = require('winston');
const app = express();

// ==================================
// 🔐 Winston Logger Configuration
// ==================================
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// ==================================
// 🔥 Firebase Initialization
// ==================================
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL
  });
}
const db = admin.firestore();

// ==================================
// 🛡️ Middleware
// ==================================
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS.split(',') || '*'
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// ==================================
// 🏦 Bank API Helpers
// ==================================
const buildSoapRequest = (action, data) => {
  const templates = {
    DoPTrans: `
    <soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                   xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                   xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
      <soap:Body>
        <DoPTrans xmlns="http://tempuri.org/">
          <Mobile>${data.phone}</Mobile>
          <Pin>${data.pin || '0000'}</Pin>
          <Cmobile>${data.phone}</Cmobile>
          <Amount>${data.amount}</Amount>
          <PW>${process.env.BANK_PW}</PW>
        </DoPTrans>
      </soap:Body>
    </soap:Envelope>`,

    OnlineConfTrans: `
    <soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                   xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                   xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
      <soap:Body>
        <OnlineConfTrans xmlns="http://tempuri.org/">
          <Mobile>${data.phone}</Mobile>
          <Pin>${data.otp}</Pin>
          <sessionID>${data.sessionID}</sessionID>
          <PW>${process.env.BANK_PW}</PW>
        </OnlineConfTrans>
      </soap:Body>
    </soap:Envelope>`
  };

  return {
    xml: templates[action],
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "SOAPAction": `http://tempuri.org/${action}`
    }
  };
};

// ==================================
// 💳 Payment Endpoints
// ==================================

/**
 * @route POST /pay
 * @desc Initiate payment transaction
 */
app.post('/pay', async (req, res) => {
  try {
    const { customer, amount, mosque, quantity } = req.body;

    // Input validation
    if (!customer || !amount || !mosque || !quantity) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Phone validation
    const phone = customer.replace(/\s/g, "");
    if (!/^\+2189\d{8}$/.test(phone)) {
      return res.status(400).json({ error: "Invalid phone format. Use +2189xxxxxxxx" });
    }

    // Build SOAP request
    const { xml, headers } = buildSoapRequest('DoPTrans', {
      phone,
      amount,
      pin: '0000' // Temporary PIN
    });

    // Send to bank
    const response = await axios.post(process.env.BANK_URL, xml, {
      headers,
      timeout: 15000
    });

    // Parse response
    const parsed = await parseStringPromise(response.data, {
      explicitArray: false,
      ignoreAttrs: true
    });

    const sessionID = parsed?.['soap:Envelope']?.['soap:Body']?.['DoPTransResponse']?.['DoPTransResult'];
    
    if (!sessionID) {
      throw new Error("Invalid bank response: Missing sessionID");
    }

    // Save transaction
    const txRef = db.collection('transactions').doc(sessionID);
    await txRef.set({
      phone,
      amount: Number(amount),
      mosque,
      quantity: Number(quantity),
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    logger.info(`Payment initiated for ${phone} - Session: ${sessionID}`);

    res.json({
      success: true,
      sessionID,
      phone // Return formatted phone for verification
    });

  } catch (error) {
    logger.error(`Payment Error: ${error.message}`, {
      error: error.stack,
      request: req.body
    });

    const errorMessage = error.response?.data?.includes?.('<faultstring>') 
      ? error.response.data.match(/<faultstring>([^<]+)<\/faultstring>/)?.[1] 
      : "Payment processing failed";

    res.status(500).json({
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route POST /confirm
 * @desc Confirm payment with OTP
 */
app.post('/confirm', async (req, res) => {
  try {
    const { sessionID, otp, phone } = req.body;

    // Input validation
    if (!sessionID || !otp || !phone) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Verify transaction exists
    const txRef = db.collection('transactions').doc(sessionID);
    const txDoc = await txRef.get();

    if (!txDoc.exists) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    // Build SOAP request
    const { xml, headers } = buildSoapRequest('OnlineConfTrans', {
      phone,
      otp,
      sessionID
    });

    // Send confirmation
    const response = await axios.post(process.env.BANK_URL, xml, {
      headers,
      timeout: 15000
    });

    // Parse response
    const parsed = await parseStringPromise(response.data, {
      explicitArray: false,
      ignoreAttrs: true
    });

    const result = parsed?.['soap:Envelope']?.['soap:Body']?.['OnlineConfTransResponse']?.['OnlineConfTransResult'];

    // Update transaction
    if (result && result.toLowerCase().includes('success')) {
      await txRef.update({
        status: 'completed',
        otpVerified: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      logger.info(`Payment confirmed for session: ${sessionID}`);

      return res.json({
        success: true,
        message: "Payment completed successfully"
      });
    }

    // Handle failure
    await txRef.update({
      status: 'failed',
      bankResponse: result,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    logger.warn(`Payment failed for session: ${sessionID}`, { bankResponse: result });

    res.status(400).json({
      error: result || "Payment confirmation failed"
    });

  } catch (error) {
    logger.error(`Confirmation Error: ${error.message}`, {
      error: error.stack,
      sessionID: req.body.sessionID
    });

    res.status(500).json({
      error: "Confirmation failed",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route GET /verify/:sessionID
 * @desc Verify transaction status
 */
app.get('/verify/:sessionID', async (req, res) => {
  try {
    const { sessionID } = req.params;

    if (!sessionID || sessionID.length < 10) {
      return res.status(400).json({ error: "Invalid session ID" });
    }

    const txDoc = await db.collection('transactions').doc(sessionID).get();

    if (!txDoc.exists) {
      return res.status(404).json({ 
        status: 'not_found',
        message: 'Transaction not found'
      });
    }

    const txData = txDoc.data();

    logger.info(`Transaction verified: ${sessionID}`, { status: txData.status });

    res.json({
      status: 'success',
      transaction: {
        ...txData,
        id: sessionID,
        // Convert Firestore timestamps
        createdAt: txData.createdAt?.toDate()?.toISOString(),
        updatedAt: txData.updatedAt?.toDate()?.toISOString()
      }
    });

  } catch (error) {
    logger.error(`Verification Error: ${error.message}`, {
      error: error.stack,
      sessionID: req.params.sessionID
    });

    res.status(500).json({
      status: 'error',
      message: 'Verification failed'
    });
  }
});

// ==================================
// 🏁 Health Check & Error Handling
// ==================================
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// Global Error Handler
app.use((err, req, res, next) => {
  logger.error(`Global Error: ${err.message}`, {
    error: err.stack,
    url: req.originalUrl
  });

  res.status(500).json({
    error: "Internal server error",
    ...(process.env.NODE_ENV === 'development' && { details: err.message })
  });
});

// ==================================
// 🚀 Server Startup
// ==================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Server started on port ${PORT}`);
  console.log(`
  ███████╗ █████╗ ███╗   ██╗██╗██╗  ██╗
  ██╔════╝██╔══██╗████╗  ██║██║╚██╗██╔╝
  ███████╗███████║██╔██╗ ██║██║ ╚███╔╝ 
  ╚════██║██╔══██║██║╚██╗██║██║ ██╔██╗ 
  ███████║██║  ██║██║ ╚████║██║██╔╝ ██╗
  ╚══════╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝╚═╝  ╚═╝
  Server ready on port ${PORT}
  `);
});
