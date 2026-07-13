// ===============================
// HERBORISTERIE TOUBA
// Script.js (الجزء الأول)
// ===============================

const whatsappNumber = "212711088984";

const products = [

{
id:1,
category:"oils",
name:"زيت الأركان",
price:"120 DH",
image:"https://images.unsplash.com/photo-1515377905703-c4788e51af15?auto=format&fit=crop&w=700&q=80",
description:"زيت أركان طبيعي 100%"
},

{
id:2,
category:"oils",
name:"زيت حبة البركة",
price:"95 DH",
image:"https://images.unsplash.com/photo-1471193945509-9ad0617afabf?auto=format&fit=crop&w=700&q=80",
description:"زيت طبيعي عالي الجودة"
},

{
id:3,
category:"creams",
name:"كريم الألوفيرا",
price:"80 DH",
image:"https://images.unsplash.com/photo-1556228578-8c89e6adf883?auto=format&fit=crop&w=700&q=80",
description:"مرطب طبيعي للبشرة"
},

{
id:4,
category:"creams",
name:"مرهم الأعشاب",
price:"70 DH",
image:"https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=700&q=80",
description:"مرهم طبيعي متعدد الاستعمالات"
},

{
id:5,
category:"herbs",
name:"إكليل الجبل",
price:"35 DH",
image:"https://images.unsplash.com/photo-1518843875459-f738682238a6?auto=format&fit=crop&w=700&q=80",
description:"أعشاب طبيعية مجففة"
},

{
id:6,
category:"herbs",
name:"الزعتر",
price:"30 DH",
image:"https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=700&q=80",
description:"زعتر طبيعي من المغرب"
},

{
id:7,
category:"cosmetics",
name:"صابون طبيعي",
price:"40 DH",
image:"https://images.unsplash.com/photo-1601612628452-9e99ced43524?auto=format&fit=crop&w=700&q=80",
description:"صابون طبيعي بالأعشاب"
},

{
id:8,
category:"cosmetics",
name:"ماء الورد",
price:"45 DH",
image:"https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=700&q=80",
description:"ماء ورد طبيعي"
}

];
const container = document.getElementById("products-container");
const categoryCards = document.querySelectorAll(".category-card");

function displayProducts(category = "all") {

container.innerHTML = "";

const filtered = category === "all"
? products
: products.filter(product => product.category === category);

filtered.forEach(product => {

container.innerHTML += `

<div class="product-card">

<img src="${product.image}" alt="${product.name}">

<div class="product-info">

<h3>${product.name}</h3>

<p>${product.description}</p>

<div class="price">${product.price}</div>

<a
class="order-btn"
target="_blank"
href="https://wa.me/${whatsappNumber}?text=${encodeURIComponent("السلام عليكم، أريد طلب " + product.name)}">

اطلب عبر واتساب

</a>

</div>

</div>

`;

});

}

displayProducts();

categoryCards.forEach(card=>{

card.addEventListener("click",()=>{

categoryCards.forEach(c=>c.classList.remove("active"));

card.classList.add("active");

displayProducts(card.dataset.category);

});

});
