const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const axios = require("axios");
const { parseStringPromise } = require("xml2js");

const app = express();

// CORS Configuration
app.use(cors({
  origin: 'https://saniah.ly',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));
app.options('*', cors());

app.use(bodyParser.json());

// Payment Endpoint
app.post("/pay", async (req, res) => {
  const { customer, amount, mosque, quantity } = req.body;

  // Input Validation
  if (!customer || !amount || !mosque || !quantity) {
    return res.status(400).json({ success: false, message: "بيانات ناقصة" });
  }

  // Format Phone Number (Keep +218)
  const rawNumber = customer.replace(/\D/g, ""); // Remove all non-digits
  const cmobile = `+218${rawNumber.slice(-9)}`; // Ensure +218 + 9 digits

  console.log("📤 Request Data:", { customer, cmobile, amount, mosque, quantity });

  // SOAP XML Request
  const xml = `
    <soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                   xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                   xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
      <soap:Body>
        <DoPTrans xmlns="http://tempuri.org/">
          <Mobile>926388438</Mobile>
          <Pin>2715</Pin>
          <Cmobile>${cmobile}</Cmobile>
          <Amount>${amount}</Amount>
          <PW>123@xdsr$#!!</PW>
        </DoPTrans>
      </soap:Body>
    </soap:Envelope>`;

  try {
    // Send Request to Bank API
    const { data } = await axios.post("http://62.240.55.2:6187/BCDUssd/newedfali.asmx", xml, {
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: "http://tempuri.org/DoPTrans"
      }
    });

    // Parse XML Response
    const result = await parseStringPromise(data);
    const sessionID = result["soap:Envelope"]["soap:Body"][0]["DoPTransResponse"][0]["DoPTransResult"][0];

    console.log("✅ Payment Success - SessionID:", sessionID);

    // Handle Bank Response Codes
    if (sessionID === "BAL") {
      return res.status(400).json({ success: false, message: "رصيد غير كافي" });
    }
    if (sessionID === "ACC") {
      return res.status(400).json({ success: false, message: "رقم الهاتف غير مفعل" });
    }
    if (!sessionID || sessionID.length < 10) {
      return res.status(500).json({ success: false, message: "استجابة غير متوقعة من المصرف" });
    }

    // Success Response
    res.json({ 
      success: true, 
      sessionID,
      bankResponse: result 
    });

  } catch (err) {
    console.error("❌ Payment Failed:", err.message);
    
    // Handle Specific Errors
    if (err.response?.data?.includes("BAL")) {
      res.status(400).json({ success: false, message: "رصيد غير كافي" });
    } else if (err.response?.data?.includes("ACC")) {
      res.status(400).json({ success: false, message: "رقم الهاتف غير مفعل أو غير مسجل" });
    } else {
      res.status(500).json({ 
        success: false, 
        message: "فشل في عملية الدفع",
        error: err.message 
      });
    }
  }
});

// Start Server
app.listen(3000, '0.0.0.0', () => {
  console.log("🚀 Server running on http://0.0.0.0:3000");
});
