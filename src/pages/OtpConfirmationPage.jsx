const handleConfirm = async () => {
  if (!otp || !donationData?.sessionID) {
    setStatus("❌ البيانات غير مكتملة أو الكود غير مدخل");
    return;
  }

  try {
    const res = await axios.post("https://saniah-api.onrender.com/confirm", {
      otp,
      phone: donationData.phone,
      quantity: donationData.quantity,
      mosque: donationData.mosque,
      sessionID: donationData.sessionID,
    });

    if (res.data.success) {
      await saveDonation(donationData); // 🟢 تخزين التبرع في Firestore
      setStatus("✅ تم الدفع بنجاح");
      localStorage.removeItem("donation_data");
    } else {
      setStatus(res.data.message || "❌ حدث خطأ أثناء تأكيد الدفع");
    }
  } catch (err) {
    console.error(err);
    setStatus("❌ فشل في الاتصال بالخادم");
  }
};