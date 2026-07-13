// HERBORISTERIE TOUBA

document.addEventListener("DOMContentLoaded", () => {

  // تأثير بسيط على بطاقات المنتجات
  const cards = document.querySelectorAll(".card");

  cards.forEach(card => {
    card.addEventListener("mouseenter", () => {
      card.style.transform = "translateY(-8px)";
    });

    card.addEventListener("mouseleave", () => {
      card.style.transform = "translateY(0)";
    });
  });

  // رسالة عند الضغط على زر الطلب
  const buttons = document.querySelectorAll(".btn");

  buttons.forEach(button => {
    button.addEventListener("click", function () {
      alert("Merci ! Vous allez être redirigé vers WhatsApp pour passer votre commande.");
    });
  });

});
