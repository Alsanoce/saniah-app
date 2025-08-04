const axios = require("axios");
const { parseStringPromise } = require("xml2js");

// 🧪 بيانات ثابتة للتجربة
const phone = "926388438";
const pin = "2715"; // هذا يكون OTP لما توصلك رسالة
const pw = "123@xdsr$#!!";

// 🧪 تجربة DoPTrans
async function testDoPTrans() {
  const xml = `
  <soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                 xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                 xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
    <soap:Body>
      <DoPTrans xmlns="http://tempuri.org/">
        <Mobile>${phone}</Mobile>
        <Pin>${pin}</Pin>
        <Cmobile>+218913798283</Cmobile>
        <Amount>6</Amount>
        <PW>${pw}</PW>
      </DoPTrans>
    </soap:Body>
  </soap:Envelope>`;

  const { data } = await axios.post("http://62.240.55.2:6187/BCDUssd/newedfali.asmx", xml, {
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: "http://tempuri.org/DoPTrans"
    }
  });

  console.log("📨 XML Response:");
  console.log(data);

  const parsed = await parseStringPromise(data);
  const sessionID = parsed["soap:Envelope"]["soap:Body"][0]["DoPTransResponse"][0]["DoPTransResult"][0];
  console.log("✅ sessionID:", sessionID);

  return sessionID;
}

// 🧪 تجربة OnlineConfTrans
async function testConfirmOTP(sessionID) {
  const otp = "الكود_اللي_وصلك"; // ✳️ عدلها يدوي بالكود الفعلي

  const xml = `
  <soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                 xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                 xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
    <soap:Body>
      <OnlineConfTrans xmlns="http://tempuri.org/">
        <Mobile>${phone}</Mobile>
        <Pin>${otp}</Pin>
        <sessionID>${sessionID}</sessionID>
        <PW>${pw}</PW>
      </OnlineConfTrans>
    </soap:Body>
  </soap:Envelope>`;

  const { data } = await axios.post("http://62.240.55.2:6187/BCDUssd/newedfali.asmx", xml, {
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: "http://tempuri.org/OnlineConfTrans"
    }
  });

  console.log("📨 رد تأكيد الدفع:");
  console.log(data);
}

(async () => {
  const sessionID = await testDoPTrans();
  // 🛑 بعد ما توصلك رسالة SMS، غير السطر الجاي وخلي OTP الفعلي
  // await testConfirmOTP(sessionID);
})();
