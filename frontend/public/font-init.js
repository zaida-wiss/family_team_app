(function () {
  var FONTS = {
    baloo: "Baloo+2:wght@400;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700",
    nunito: "Nunito:wght@400;500;600;700;800",
    fredoka: "DM+Sans:ital,wght@0,400;0,500;0,600;0,700&family=Fredoka:wght@400;500;600;700",
    comfortaa: "Comfortaa:wght@400;500;600;700&family=Outfit:wght@400;500;600;700",
    poppins: "Poppins:wght@400;500;600;700;800",
  };
  var f = localStorage.getItem("app-font");
  if (f) document.documentElement.className = (document.documentElement.className + " font-" + f).trim();
  var l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=" + (FONTS[f] || FONTS.baloo) + "&display=swap";
  l.media = "print";
  l.onload = function () { this.media = "all"; this.onload = null; };
  document.head.appendChild(l);
})();
