const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const axios = require("axios");
const { parseStringPromise } = require("xml2js");

const app = express();

app.use(cors({
  origin: 'https://saniah.ly',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));
app.options('*', cors());

app.use(bodyParser.json());
app.post("/pay", async (req, res) => {
  const { customer, amount, mosque } = req.body;

  if (!customer || !amount || !mosque) {
    return res.status(400).json({ success: false, message: "بيانات ناقصة" });
  }

  // 🛠️ إزالة +218 إن وجدت
  const rawNumber = customer.replace('+218', '').trim();
  const cmobile = `218${rawNumber}`;  // بدون +

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

  console.log("📤 XML المرسل:\n", xml); // 🪵 لوغ للتأكد

  try {
    const { data } = await axios.post("http://62.240.55.2:6187/BCDUssd/newedfali.asmx", xml, {
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: "http://tempuri.org/DoPTrans"
      }
    });

    const result = await parseStringPromise(data);
    const sessionID = result["soap:Envelope"]["soap:Body"][0]["DoPTransResponse"][0]["DoPTransResult"][0];

    console.log("📩 sessionID:", sessionID);
    res.json({ success: true, sessionID });

  } catch (err) {
    console.error("❌ فشل /pay:", err.message);
    res.status(500).json({ success: false, message: "فشل في العملية" });
  }
});

app.listen(3000, '0.0.0.0', () => {
  console.log("🚀 API شغال على http://0.0.0.0:3000");
});
