const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const axios = require("axios");
const xml2js = require("xml2js");
const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

const app = express();
app.use(cors());
app.use(bodyParser.json());

const BANK_URL = "http://62.240.55.2:6187/BCDUssd/newedfali.asmx";
const BANK_MERCHANT = "926388438";
const BANK_PIN = "2715";
const BANK_PW = "123@xdsr$#!!";

// 📥 PAY
app.post("/pay", async (req, res) => {
  const { customer, quantity, mosque = "غير محدد" } = req.body;
  const amount = quantity * 6;

  const xml = `
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <DoPTrans xmlns="http://tempuri.org/">
      <merchant>${BANK_MERCHANT}</merchant>
      <Pin>${BANK_PIN}</Pin>
      <customer>${customer}</customer>
      <amount>${amount}</amount>
      <ServiceID>2</ServiceID>
      <PW>${BANK_PW}</PW>
    </DoPTrans>
  </soap:Body>
</soap:Envelope>`;

  try {
    const bankRes = await axios.post(BANK_URL, xml, {
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: "http://tempuri.org/DoPTrans",
      },
    });

    const result = await xml2js.parseStringPromise(bankRes.data);
    const sessionID =
      result["soap:Envelope"]["soap:Body"][0]["DoPTransResponse"][0]["DoPTransResult"][0];

    await db.collection("transactions").add({
      mosque,
      phone: customer,
      quantity,
      sessionID,
      status: "pending",
      method: "ادفع لي",
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ sessionID });
  } catch (err) {
    console.error("❌ DoPTrans Error", err.message);
    res.status(500).json({ error: "Failed to initiate payment" });
  }
});

// 🔐 CONFIRM
app.post("/confirm", async (req, res) => {
  const { otp, sessionID } = req.body;

  const xml = `
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <OnlineConfTrans xmlns="http://tempuri.org/">
      <Mobile>${BANK_MERCHANT}</Mobile>
      <Pin>${otp}</Pin>
      <sessionID>${sessionID}</sessionID>
      <PW>${BANK_PW}</PW>
    </OnlineConfTrans>
  </soap:Body>
</soap:Envelope>`;

  try {
    const bankRes = await axios.post(BANK_URL, xml, {
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: "http://tempuri.org/OnlineConfTrans",
      },
    });

    const result = await xml2js.parseStringPromise(bankRes.data);
    const resultText =
      result["soap:Envelope"]["soap:Body"][0]["OnlineConfTransResponse"][0]["OnlineConfTransResult"][0];

    const snapshot = await db
      .collection("transactions")
      .where("sessionID", "==", sessionID)
      .limit(1)
      .get();

    snapshot.forEach((doc) =>
      doc.ref.update({ status: resultText.includes("OK") ? "confirmed" : "failed" })
    );

    res.json({ result: resultText });
  } catch (err) {
    console.error("❌ Confirm Error", err.message);
    res.status(500).json({ error: "Failed to confirm payment" });
  }
});

app.listen(5051, () => {
  console.log("🚀 TDB Proxy server running on port 5051");
});
