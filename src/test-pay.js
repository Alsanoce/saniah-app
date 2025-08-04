const axios = require("axios");
const { parseStringPromise } = require("xml2js");

const customer = "218926388438"; // ✅ رقم الزبون بصيغة صحيحة (بدون +)
const amount = "12.00"; // أو أي مبلغ حسب عدد الأستيكات

const xml = `
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <DoPTrans xmlns="http://tempuri.org/">
      <Mobile>926388438</Mobile>
      <Pin>2715</Pin>
      <Cmobile>${customer}</Cmobile>
      <Amount>${amount}</Amount>
      <PW>123@xdsr$#!!</PW>
    </DoPTrans>
  </soap:Body>
</soap:Envelope>
`;

(async () => {
  try {
    const { data } = await axios.post("http://62.240.55.2:6187/BCDUssd/newedfali.asmx", xml, {
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: "http://tempuri.org/DoPTrans"
      }
    });

    console.log("📨 رد XML:\n", data);

    const parsed = await parseStringPromise(data);
    const sessionID = parsed["soap:Envelope"]["soap:Body"][0]["DoPTransResponse"][0]["DoPTransResult"][0];

    console.log("✅ sessionID:", sessionID);

  } catch (err) {
    console.error("❌ فشل:", err.message);
  }
})();
