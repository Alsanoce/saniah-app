//8/5/2025
const express = require('express');
const axios = require('axios');
const { parseStringPromise } = require('xml2js');
const admin = require('firebase-admin');
const cors = require('cors');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Firebase Initialization
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(require('./serviceAccountKey.json'))
  });
}
const db = admin.firestore();

// Configurations
const BANK_PW = process.env.BANK_PW || "123@xdsr$#!!";
const BANK_URL = process.env.BANK_URL || "http://62.240.55.2:6187/BCDUssd/newedfali.asmx";

// Helper Functions
const logError = (error, context) => {
  console.error(`❌ [${new Date().toISOString()}] Error in ${context}:`, {
    message: error.message,
    stack: error.stack,
    response: error.response?.data
  });
};

const validatePhone = (phone) => {
  const cleaned = phone.replace(/\s/g, "");
  return /^\+2189\d{8}$/.test(cleaned) ? cleaned : null;
};

// Routes
app.post('/pay', async (req, res) => {
  try {
    const { customer, amount, mosque, quantity } = req.body;
    
    // Phone Validation
    const phone = validatePhone(customer);
    if (!phone) {
      return res.status(400).json({ error: "رقم الهاتف يجب أن يكون بتنسيق +2189xxxxxxxx" });
    }

    // Create SOAP Request
    const xml = `
    <soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                   xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                   xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
      <soap:Body>
        <DoPTrans xmlns="http://tempuri.org/">
          <Mobile>${phone}</Mobile>
          <Pin>0000</Pin>
          <Cmobile>${phone}</Cmobile>
          <Amount>${amount}</Amount>
          <PW>${BANK_PW}</PW>
        </DoPTrans>
      </soap:Body>
    </soap:Envelope>`;

    // Send to Bank
    const response = await axios.post(BANK_URL, xml, {
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: "http://tempuri.org/DoPTrans"
      },
      timeout: 10000
    });

    // Parse Response
    const parsed = await parseStringPromise(response.data);
    const sessionID = parsed['soap:Envelope']['soap:Body'][0]['DoPTransResponse'][0]['DoPTransResult'][0];
    
    if (!sessionID || sessionID.length < 10) {
      throw new Error("Invalid session ID from bank");
    }

    // Save to Firestore
    await db.collection('transactions').doc(sessionID).set({
      phone,
      amount,
      mosque,
      quantity,
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ sessionID, phone });

  } catch (error) {
    logError(error, "payment");
    const message = error.response?.data?.includes?.('<faultstring>') 
      ? error.response.data.match(/<faultstring>([^<]+)<\/faultstring>/)[1]
      : "فشل في عملية الدفع";
    res.status(500).json({ error: message });
  }
});

app.post('/confirm', async (req, res) => {
  try {
    const { sessionID, otp, phone } = req.body;

    // Verify Transaction Exists
    const doc = await db.collection('transactions').doc(sessionID).get();
    if (!doc.exists) {
      return res.status(404).json({ error: "لم يتم العثور على المعاملة" });
    }

    // SOAP Request
    const xml = `
    <soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                   xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                   xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
      <soap:Body>
        <OnlineConfTrans xmlns="http://tempuri.org/">
          <Mobile>${phone}</Mobile>
          <Pin>${otp}</Pin>
          <sessionID>${sessionID}</sessionID>
          <PW>${BANK_PW}</PW>
        </OnlineConfTrans>
      </soap:Body>
    </soap:Envelope>`;

    // Send Confirmation
    const response = await axios.post(BANK_URL, xml, {
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: "http://tempuri.org/OnlineConfTrans"
      },
      timeout: 10000
    });

    // Parse Response
    const parsed = await parseStringPromise(response.data);
    const result = parsed['soap:Envelope']['soap:Body'][0]['OnlineConfTransResponse'][0]['OnlineConfTransResult'][0];
    
    // Update Firestore
    if (result.toLowerCase().includes('success')) {
      await db.collection('transactions').doc(sessionID).update({
        status: 'completed',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return res.json({ success: true, message: "تمت العملية بنجاح" });
    } else {
      await db.collection('transactions').doc(sessionID).update({
        status: 'failed',
        bankMessage: result,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return res.status(400).json({ error: result });
    }

  } catch (error) {
    logError(error, "confirmation");
    res.status(500).json({ error: "فشل في تأكيد الدفع" });
  }
});

// New Verify Endpoint
app.get('/verify/:sessionID', async (req, res) => {
  try {
    const { sessionID } = req.params;
    const doc = await db.collection('transactions').doc(sessionID).get();
    
    if (!doc.exists) {
      return res.status(404).json({ 
        status: 'not_found',
        message: 'لم يتم العثور على المعاملة'
      });
    }

    res.json({
      status: 'success',
      data: doc.data()
    });
    
  } catch (error) {
    logError(error, "verification");
    res.status(500).json({
      status: 'error',
      message: 'حدث خطأ أثناء التحقق'
    });
  }
});

// Error Handling Middleware
app.use((err, req, res, next) => {
  logError(err, "server");
  res.status(500).json({ error: "حدث خطأ غير متوقع" });
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
