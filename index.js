app.post("/pay", async (req, res) => {
  const { customer, amount, mosque } = req.body;

  if (!customer || !amount || !mosque) {
    return res.status(400).json({ success: false, message: "بيانات ناقصة" });
  }

  // 🔧 إزالة +218 إذا موجودة
  let cleanedNumber = customer;
  if (cleanedNumber.startsWith("+218")) {
    cleanedNumber = cleanedNumber.replace("+218", "218");
  }

  const xml = `
    <soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                   xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                   xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
      <soap:Body>
        <DoPTrans xmlns="http://tempuri.org/">
          <Mobile>926388438</Mobile>
          <Pin>2715</Pin>
          <Cmobile>${cleanedNumber}</Cmobile>
          <Amount>${amount}</Amount>
          <PW>123@xdsr$#!!</PW>
        </DoPTrans>
      </soap:Body>
    </soap:Envelope>`;

  try {
    const { data } = await axios.post("http://62.240.55.2:6187/BCDUssd/newedfali.asmx", xml, {
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: "http://tempuri.org/DoPTrans",
      },
    });

    console.log("📨 الرد الكامل من المصرف:\n", data); // 🟡 log كامل XML

    const result = await parseStringPromise(data);
    const sessionID = result["soap:Envelope"]["soap:Body"][0]["DoPTransResponse"][0]["DoPTransResult"][0];

    console.log("📩 sessionID:", sessionID);
    res.json({ success: true, sessionID });

  } catch (err) {
    console.error("❌ فشل /pay:", err.message);
    res.status(500).json({ success: false, message: "فشل في العملية" });
  }
});
