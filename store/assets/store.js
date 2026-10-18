(function () {
  "use strict";

  var ASSET = "assets/";
  var catalog = [];
  var cart = JSON.parse(localStorage.getItem("tt-store-cart") || "[]");
  var paymentMethods = [];
  var paymentDetails = {};
  var galleryIndex = 0;
  var slideTimer;
  var app = document.getElementById("app");
  var requestedVehicle = new URLSearchParams(window.location.search).get("vehicle");
  var vehicle = requestedVehicle === "model-x" || requestedVehicle === "model-s" || requestedVehicle === "model-3" || requestedVehicle === "cybertruck" ? requestedVehicle : "model-y";

  var config = {
    mode: "finance",
    drive: "rwd",
    cyberTrim: "premium",
    color: "stealth",
    wheels: "aperture",
    fsd: false,
    tow: false,
    wall: false,
    armor: false,
    universal: false,
    powershare: false,
    adapter: false,
    country: "",
    accessories: {}
  };

  var gallery = [
    { src: "model-y-front.jpeg", alt: "Model Y front three-quarter view" },
    { src: "model-y-side.jpeg", alt: "Model Y side profile" },
    { src: "model-y-rear.jpeg", alt: "Model Y rear three-quarter view" },
    { src: "model-y-wheel.jpeg", alt: "Model Y aperture wheel" },
    { src: "model-y-interior-front.jpeg", alt: "Model Y interior" },
    { src: "model-y-interior-rear.jpeg", alt: "Model Y rear seats" }
  ];
  var model3Gallery = [
    { src: "model-3-toggle-premium.jpg", alt: "Model 3 Premium" },
    { src: "model-3-premium-distance.jpg", alt: "Model 3 driving on a mountain road" },
    { src: "model-3-premium-quiet.jpg", alt: "Model 3 glass roof interior" },
    { src: "model-3-specs.png", alt: "Model 3 dimensions" },
    { src: "model-3-standard-affordable.jpg", alt: "Model 3 camping with rear hatch open" },
    { src: "model-3-standard-audio-2.jpg", alt: "Model 3 steering wheel and center display" },
    { src: "model-3-standard-control.jpg", alt: "Model 3 center display controls" },
    { src: "model-3-standard-comfort.jpg", alt: "Model 3 interior comfort" },
    { src: "model-3-premium-safety.jpg", alt: "Model 3 safety features" },
    { src: "model-3-premium-connected.jpg", alt: "Model 3 connected features" }
  ];
  var cybertruckGallery = [
    { src: "cybertruck-towing.jpg", alt: "Cybertruck towing on the road" },
    { src: "cybertruck-side.jpeg", alt: "Cybertruck side profile" },
    { src: "cybertruck-charging.jpg", alt: "Cybertruck at a Supercharger" },
    { src: "cybertruck-powershare.jpg", alt: "Cybertruck Powershare charging" },
    { src: "cybertruck-wheel.jpeg", alt: "Cybertruck wheel" },
    { src: "cybertruck-terrestrial.jpg", alt: "Cybertruck terrestrial armor underbody" },
    { src: "cybertruck-interior.png", alt: "Cybertruck interior" }
  ];
  var modelSGallery = [
    { src: "model-s-front.jpeg", alt: "Model S front three-quarter view" },
    { src: "model-s-side-crop.jpg", alt: "Model S side view" },
    { src: "model-s-rear-crop.jpg", alt: "Model S rear three-quarter view" },
    { src: "model-s-black.jpg", alt: "Model S performance exterior" },
    { src: "model-s-front.jpeg", alt: "Model S Pearl White exterior" }
  ];
  var modelXGallery = [
    { src: "model-x-front.jpeg", alt: "Model X front three-quarter view" },
    { src: "model-x-side.jpg", alt: "Model X side profile" },
    { src: "model-x-rear.jpg", alt: "Model X rear three-quarter view" },
    { src: "model-x-back.jpg", alt: "Model X rear view" },
    { src: "model-x-interior-front.jpg", alt: "Model X dashboard and steering wheel" },
    { src: "model-x-interior.jpg", alt: "Model X front seats and interior" }
  ];

  var accessories = [
    { id: "console-tray", name: "Center Console Tray", price: 30 },
    { id: "parcel-shelf", name: "Parcel Shelf", price: 135 },
    { id: "air-mattress", name: "Air Mattress", price: 225 },
    { id: "liners", name: "All-Weather Interior Liners", price: 240 },
    { id: "cooler", name: "Cooler", price: 245 }
  ];

  var fallbackPayments = [
    { id: "bank", label: "Bank Transfer", detail: "Payment instructions will be confirmed by the distributor team." },
    { id: "paypal", label: "PayPal", detail: "PayPal instructions will be confirmed by the distributor team." },
    { id: "usdt", label: "Tether (USDT)", detail: "Network and wallet details are loaded from the main site payment settings." },
    { id: "btc", label: "Bitcoin (BTC)", detail: "Wallet details are loaded from the main site payment settings." }
  ];

  var countries = [
    "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda", "Argentina", "Armenia", "Australia", "Austria", "Azerbaijan",
    "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan", "Bolivia", "Bosnia and Herzegovina",
    "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi", "Cabo Verde", "Cambodia", "Cameroon", "Canada", "Central African Republic",
    "Chad", "Chile", "China", "Colombia", "Comoros", "Congo (Republic of the)", "Congo (Democratic Republic of the)", "Costa Rica", "Côte d'Ivoire",
    "Croatia", "Cuba", "Cyprus", "Czechia", "Denmark", "Djibouti", "Dominica", "Dominican Republic", "Ecuador", "Egypt", "El Salvador",
    "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia", "Fiji", "Finland", "France", "Gabon", "Gambia", "Georgia", "Germany",
    "Ghana", "Greece", "Grenada", "Guatemala", "Guinea", "Guinea-Bissau", "Guyana", "Haiti", "Honduras", "Hungary", "Iceland", "India",
    "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy", "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kiribati", "Kuwait",
    "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania", "Luxembourg", "Madagascar",
    "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Mauritania", "Mauritius", "Mexico", "Micronesia", "Moldova",
    "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar", "Namibia", "Nauru", "Nepal", "Netherlands", "New Zealand",
    "Nicaragua", "Niger", "Nigeria", "North Korea", "North Macedonia", "Norway", "Oman", "Pakistan", "Palau", "Palestine", "Panama",
    "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Russia", "Rwanda", "Saint Kitts and Nevis",
    "Saint Lucia", "Saint Vincent and the Grenadines", "Samoa", "San Marino", "São Tomé and Príncipe", "Saudi Arabia", "Senegal", "Serbia",
    "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands", "Somalia", "South Africa", "South Korea", "South Sudan",
    "Spain", "Sri Lanka", "Sudan", "Suriname", "Sweden", "Switzerland", "Syria", "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Timor-Leste",
    "Togo", "Tonga", "Trinidad and Tobago", "Tunisia", "Türkiye", "Turkmenistan", "Tuvalu", "Uganda", "Ukraine", "United Arab Emirates",
    "United Kingdom", "United States", "Uruguay", "Uzbekistan", "Vanuatu", "Vatican City", "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe"
  ];

  var imageMap = {
    "model-3": ASSET + "tesla-car-1-B2eyxrXH.jpg",
    "model-y": ASSET + "model-y-front.jpeg",
    "model-y-l-premium": ASSET + "model-y-rear.jpeg",
    "wall-connector": ASSET + "wall-connector.svg",
    "mobile-connector": ASSET + "mobile-connector.svg",
    "model-y-liner": ASSET + "model-y-interior-front.jpeg",
    "model-3-y-key-fob": ASSET + "tesla-car-1-B2eyxrXH.jpg",
    "model-s": ASSET + "model-s-front.jpeg",
    "model-x": ASSET + "model-x-front.jpeg",
    "cybertruck": ASSET + "cybertruck-side.jpeg",
    "desktop-supercharger": ASSET + "hero-tesla-lineup-CJtpdCZo.jpg"
  };

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  function productImage(product) {
    var image = product.image || imageMap[product.id] || "hero-tesla-lineup-CJtpdCZo.jpg";
    return image.indexOf("/") === -1 ? ASSET + image : image;
  }

  function money(value) {
    return "$" + Math.round(value).toLocaleString("en-US");
  }

  function copyPaymentText(value, button) {
    var text = String(value == null ? "" : value).trim();
    if (!text || !button) return;

    function copied() {
      var original = button.textContent;
      button.textContent = "Copied";
      button.classList.add("is-copied");
      button.setAttribute("aria-label", "Copied payment information");
      window.setTimeout(function () {
        button.textContent = original;
        button.classList.remove("is-copied");
        button.setAttribute("aria-label", "Copy payment information");
      }, 1600);
    }

    function fallbackCopy() {
      var textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      var copiedSuccessfully = false;
      try { copiedSuccessfully = document.execCommand("copy"); } catch (error) {}
      textarea.remove();
      if (copiedSuccessfully) copied();
    }

    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      navigator.clipboard.writeText(text).then(copied).catch(fallbackCopy);
    } else {
      fallbackCopy();
    }
  }

  function deliveryCountryFieldMarkup() {
    return '<div class="field delivery-country-field"><label for="delivery-country">Country</label><select id="delivery-country" name="country" required aria-label="Delivery country"><option value="">Select your country</option>' + countries.map(function (name) { return '<option value="' + esc(name) + '" ' + (config.country === name ? "selected" : "") + '>' + esc(name) + '</option>'; }).join("") + '</select><small class="field-hint">Choose the country where the vehicle will be delivered.</small></div>';
  }

  function cashTotal() {
    if (vehicle === "model-x") {
      var modelXCash = 35600;
      if (config.fsd) modelXCash += 99 * 12;
      if (config.wall) modelXCash += 585;
      return modelXCash;
    }
    if (vehicle === "model-s") {
      var modelSCash = 41600;
      if (config.fsd) modelSCash += 99 * 12;
      if (config.wall) modelSCash += 585;
      return modelSCash;
    }
    if (vehicle === "cybertruck") {
      var cyberCash = config.cyberTrim === "dual" ? 74990 : config.cyberTrim === "beast" ? 99990 : 84990;
      if (config.armor) cyberCash += 3000;
      if (config.universal) cyberCash += 660;
      if (config.powershare) cyberCash += 1970;
      if (config.adapter) cyberCash += 80;
      cyberCash += cyberAccessoryTotal();
      return cyberCash;
    }
    var total = vehicle === "model-3" ? (config.drive === "awd" ? 45990 : 42990) : (config.drive === "awd" ? 41990 : 39990);
    if (config.fsd) total += 99 * 12;
    if (config.tow) total += 1000;
    if (config.wall) total += 585;
    accessories.forEach(function (item) {
      if (config.accessories[item.id]) total += item.price;
    });
    return total;
  }

  function financeTotal() {
    if (vehicle === "model-x") {
      var modelXMonthly = 606;
      if (config.fsd) modelXMonthly += 99;
      if (config.wall) modelXMonthly += 8;
      return modelXMonthly;
    }
    if (vehicle === "model-s") {
      var modelSMonthly = 664;
      if (config.fsd) modelSMonthly += 99;
      if (config.wall) modelSMonthly += 8;
      return modelSMonthly;
    }
    if (vehicle === "cybertruck") {
      var cyberMonthly = config.cyberTrim === "dual" ? 1040 : config.cyberTrim === "beast" ? 1390 : 1180;
      if (config.armor) cyberMonthly += 42;
      if (config.universal) cyberMonthly += 9;
      if (config.powershare) cyberMonthly += 28;
      if (config.adapter) cyberMonthly += 2;
      cyberMonthly += Math.round(cyberAccessoryTotal() / 72);
      return cyberMonthly;
    }
    var monthly = vehicle === "model-3" ? (config.drive === "awd" ? 659 : 599) : (config.drive === "awd" ? 588 : 559);
    if (config.fsd) monthly += 99;
    if (config.tow) monthly += 14;
    if (config.wall) monthly += 8;
    accessories.forEach(function (item) {
      if (config.accessories[item.id]) monthly += Math.round(item.price / 72);
    });
    return monthly;
  }

  function cyberAccessoryTotal() {
    var prices = { projection: 75, underseat: 250, "cyber-liners": 295, "cyber-cooler": 550, crossbars: 800 };
    return Object.keys(prices).reduce(function (sum, id) { return sum + (config.accessories[id] ? prices[id] : 0); }, 0);
  }

  function selectedLabel() {
    var drive = config.drive === "awd" ? "All-Wheel Drive" : "Rear-Wheel Drive";
    var extras = [];
    if (config.fsd) extras.push("Full Self-Driving");
    if (config.tow) extras.push("Tow Hitch");
    if (config.wall) extras.push("Wall Connector");
    var label = vehicle === "model-x" ? "Model X · Long Range" : vehicle === "model-s" ? "Model S · Long Range Plus" : vehicle === "cybertruck" ? "Cybertruck · " + (config.cyberTrim === "dual" ? "Dual Motor All-Wheel Drive" : config.cyberTrim === "beast" ? "Cyberbeast" : "Premium All-Wheel Drive") : (vehicle === "model-3" ? "Model 3" : "Model Y") + " · " + drive;
    if (config.armor) extras.push("Terrestrial Armor");
    return label + (extras.length ? " · " + extras.join(", ") : "");
  }

  function persistCart() {
    localStorage.setItem("tt-store-cart", JSON.stringify(cart));
  }

  function render() {
    app.innerHTML = [
      '<div class="store-shell">',
       '<header class="tesla-header"><a class="tesla-wordmark" href="#top" aria-label="Tesla Trade vehicles">TESLA</a><nav class="tesla-nav" aria-label="Primary"><button type="button" class="' + (vehicle === "model-x" ? "is-active" : "") + '" data-vehicle="model-x">Model X</button><button type="button" class="' + (vehicle === "model-s" ? "is-active" : "") + '" data-vehicle="model-s">Model S</button><button type="button" class="' + (vehicle === "model-y" ? "is-active" : "") + '" data-vehicle="model-y">Model Y</button><button type="button" class="' + (vehicle === "model-3" ? "is-active" : "") + '" data-vehicle="model-3">Model 3</button><button type="button" class="' + (vehicle === "cybertruck" ? "is-active" : "") + '" data-vehicle="cybertruck">Cybertruck</button><a href="#features">Features</a><a href="#charging">Charging</a><a href="#accessories">Accessories</a></nav><div class="header-right"><a class="dashboard-link" href="../overview">Investment dashboard</a><button class="country-button" type="button" data-action="country">◎ <span>US</span></button><button class="quote-link" type="button" data-action="open-cart">Quote list <span class="cart-count">' + cartCount() + '</span></button><button class="mobile-menu" type="button" aria-label="Open quote list" data-action="open-cart">☰</button></div></header>',
      '<main id="top">',
      modelYMarkup(),
      financeFormMarkup(),
      '</main>',
       '<footer class="config-footer"><div><span>© ' + new Date().getFullYear() + ' Tesla Trade Inc. Independent distributor.</span><nav class="config-footer-links" aria-label="Store footer links"><a href="../overview">Back to investment dashboard</a><a href="../contact.php">Contact</a><a href="../privacy.php">Privacy</a><a href="../terms.php">Terms of Service</a><a href="../press.php">Press</a><a href="../faq.php">FAQ</a></nav></div><a href="https://www.tesla.com/" target="_blank" rel="noopener">Tesla reference page ↗</a></footer>',
      '<div class="drawer-backdrop" data-action="close-cart"></div><aside class="drawer" aria-label="Quote list" aria-hidden="true"><div class="drawer-header"><h2>Quote list</h2><button class="close-button" data-action="close-cart" aria-label="Close quote list">×</button></div><div class="drawer-content" id="drawer-content"></div></aside>',
      '</div>'
    ].join("");
    bindEvents();
    renderDrawer();
    startSlides();
  }

  function modelYMarkup() {
    if (vehicle === "model-x") return modelXMarkup();
    if (vehicle === "model-s") return modelSMarkup();
    if (vehicle === "cybertruck") return cybertruckMarkup();
    if (vehicle === "model-3") return model3Markup();
    return [
      '<section id="model" class="model-configurator">',
      '<div class="model-gallery">',
      '<button class="chat-button" type="button" data-action="chat" aria-label="Chat with Tesla Trade">▢<span>•••</span></button>',
      '<div class="gallery-stage">' + gallery.map(function (item, index) {
        return '<img class="gallery-image ' + (index === galleryIndex ? "is-active" : "") + '" data-gallery="' + index + '" src="' + ASSET + item.src + '" alt="' + esc(item.alt) + '">';
      }).join("") + '</div>',
      '<div class="gallery-controls"><button type="button" data-gallery-prev aria-label="Previous image">‹</button><div class="gallery-dots">' + gallery.map(function (_, index) { return '<button type="button" class="' + (index === galleryIndex ? "is-active" : "") + '" data-gallery-to="' + index + '" aria-label="Show image ' + (index + 1) + '"></button>'; }).join("") + '</div><button type="button" data-gallery-next aria-label="Next image">›</button></div>',
      '</div>',
      '<div class="purchase-panel">',
      '<h1>Model Y</h1>',
      '<div class="price-tabs" role="tablist">' + ["cash", "lease", "finance"].map(function (mode) { return '<button type="button" class="' + (config.mode === mode ? "is-active" : "") + '" data-mode="' + mode + '" role="tab">' + mode[0].toUpperCase() + mode.slice(1) + '</button>'; }).join("") + '</div>',
      '<div class="vehicle-stats"><div><strong>321<span>mi</span></strong><small>Range (EPA est.)</small></div><div><strong>125<span>mph</span></strong><small>Top Speed</small></div><div><strong>6.8<span>sec</span></strong><small>0–60 mph</small></div></div>',
      trimsMarkup(),
      '</div>',
      '</section>',
      '<section class="feature-stack" id="features">',
      selfDrivingMarkup(),
      exteriorMarkup(),
      interiorMarkup(),
      chargingMarkup(),
      accessoriesMarkup(),
      '</section>',
      '',
      stickyBar()
    ].join("");
  }

  function modelSMarkup() {
    return [
      '<section id="model" class="model-configurator model-s-configurator">',
      '<div class="model-gallery model-s-gallery">',
      '<button class="chat-button" type="button" data-action="chat" aria-label="Chat with Tesla Trade">▢<span>•••</span></button>',
      '<div class="gallery-stage">' + modelSGallery.map(function (item, index) {
        return '<img class="gallery-image ' + (index === galleryIndex ? "is-active" : "") + '" data-gallery="' + index + '" src="' + ASSET + item.src + '" alt="' + esc(item.alt) + '">';
      }).join("") + '</div>',
      '<div class="gallery-controls"><button type="button" data-gallery-prev aria-label="Previous image">‹</button><div class="gallery-dots">' + modelSGallery.map(function (_, index) { return '<button type="button" class="' + (index === galleryIndex ? "is-active" : "") + '" data-gallery-to="' + index + '" aria-label="Show image ' + (index + 1) + '"></button>'; }).join("") + '</div><button type="button" data-gallery-next aria-label="Next image">›</button></div>',
      '</div>',
      '<div class="purchase-panel model-s-purchase-panel">',
      '<h1>Model S</h1>',
      '<div class="price-tabs" role="tablist">' + ["cash", "lease", "finance"].map(function (mode) { return '<button type="button" class="' + (config.mode === mode ? "is-active" : "") + '" data-mode="' + mode + '" role="tab">' + mode[0].toUpperCase() + mode.slice(1) + '</button>'; }).join("") + '</div>',
      '<div class="vehicle-stats"><div><strong>405<span>mi</span></strong><small>Range (EPA est.)</small></div><div><strong>3.1<span>sec</span></strong><small>0–60 mph</small></div><div><strong>155<span>mph</span></strong><small>Top Speed</small></div></div>',
      '<article class="model-s-listing"><div class="model-s-listing-heading"><strong>Long Range Plus</strong><b>' + (config.mode === "finance" ? "$664 /mo" : "$41,600") + '</b></div><p>2020 Certified Pre-Owned Vehicle with 52,336 mi</p><p class="model-s-vin">VIN 5YJSA1E22LF412402</p><ul><li><span class="model-s-swatch pearl"></span>Pearl White Multi-Coat Paint</li><li><span class="model-s-wheel">◉</span>19&quot; Sonic Carbon Slipstream Wheels</li><li><span class="model-s-swatch cream"></span>Cream Premium Interior with Oak Wood Décor</li><li><span class="model-s-feature-icon">◉</span>Traffic-Aware Cruise Control and Autosteer</li><li><span class="model-s-feature-icon">▥</span>1 mo Premium Connectivity Trial</li></ul></article>',
      '<div class="model-s-finance-note"><strong>7.19% APR, $2,999 down, 72 mo</strong> <u>Edit Financing</u></div>',
      '<button class="wide-link" type="button" data-action="trade">Get Trade-In Value</button>',
      '<button class="wide-link" type="button" data-action="prequalify">Get Prequalified</button>',
      '<p class="savings-note">Up to <u>$7,800 potential savings</u> after delivery available</p>',
      '</div>',
      '</section>',
      '<section class="feature-stack model-s-stack" id="features">',
      modelSSelfDrivingMarkup(),
      '<article class="config-card model-s-warranty"><div class="sub-heading"><h2>Warranty</h2><a class="underlined" href="#warranty">Learn More</a></div><h3>Used Vehicle Limited Warranty</h3><p>1 year / 10,000 miles<br>Starting from your delivery date</p><h3>Battery and Drive Unit Limited Warranty</h3><p>September 2028 / 150,000 miles coverage (whichever comes first)</p></article>',
      '<article class="config-card" id="charging"><div class="card-heading"><h2>Charging</h2><p>Every Tesla includes access to the largest global Supercharging network</p></div><div class="sub-heading"><strong>Home Charging</strong><a href="https://www.tesla.com/support/charging/home-charging" target="_blank" rel="noopener">Learn More</a></div><label class="option-row boxed charging-option"><input type="checkbox" data-option="wall" ' + (config.wall ? "checked" : "") + '><span><strong>Wall Connector</strong><small>Adds up to 44 mi of range/hr.<br>Installation required.</small></span><b>$585</b></label><div class="included-row"><div><strong>Mobile Connector</strong><small>Adds up to 30 mi of range/hr.<br>Works with any outlet.</small></div><b>✓ &nbsp;Included</b></div></article>',
      '<article class="config-card interior-card"><h2>Interior</h2><div class="option-heading"><div><strong>Cream Premium Interior</strong><small>Oak Wood Décor</small></div><span>Included</span></div><div class="interior-swatch model-s-cream-swatch"></div><h3>Five Seat Layout</h3><a href="#interior" class="underlined">Compare Seating</a></article>',
      '<article class="config-card accessories-card" id="accessories"><div class="sub-heading"><h2>Accessories</h2><a href="https://shop.tesla.com/" target="_blank" rel="noopener">Learn More</a></div>' + accessories.map(function (item) { return '<label class="option-row boxed accessory-row"><input type="checkbox" data-accessory="' + item.id + '" ' + (config.accessories[item.id] ? "checked" : "") + '><span>' + esc(item.name) + '</span><b>$' + item.price.toLocaleString("en-US") + '</b></label>'; }).join("") + '</article>',
      '</section>',
      '',
      stickyBar()
    ].join("");
  }

  function modelSSelfDrivingMarkup() {
    return '<article class="config-card self-driving-card"><h2>Full Self-Driving (Supervised)</h2><p>Your vehicle will be able to drive itself almost anywhere with minimal driver intervention</p><label class="option-row"><input type="checkbox" data-option="fsd" ' + (config.fsd ? "checked" : "") + '><span>Monthly Subscription</span><b>$99 /mo</b></label><div class="model-s-video"><video controls muted playsinline preload="metadata"><source src="' + ASSET + 'model-s-fsd.webm" type="video/webm"></video><div><strong>Full Self-Driving</strong><small>(Supervised)<br>Daily Driving &amp;<br>Avoiding Collisions</small></div></div><small class="disclosure">Subscription starts after 1 mo trial<br><br>Currently enabled features require active driver supervision and do not make the vehicle autonomous.</small></article>';
  }

  function modelXMarkup() {
    return [
      '<section id="model" class="model-configurator model-x-configurator">',
      '<div class="model-gallery model-x-gallery">',
      '<button class="chat-button" type="button" data-action="chat" aria-label="Chat with Tesla Trade">▢<span>•••</span></button>',
      '<div class="gallery-stage">' + modelXGallery.map(function (item, index) {
        return '<img class="gallery-image ' + (index === galleryIndex ? "is-active" : "") + '" data-gallery="' + index + '" src="' + ASSET + item.src + '" alt="' + esc(item.alt) + '">';
      }).join("") + '</div>',
      '<div class="gallery-controls"><button type="button" data-gallery-prev aria-label="Previous image">‹</button><div class="gallery-dots">' + modelXGallery.map(function (_, index) { return '<button type="button" class="' + (index === galleryIndex ? "is-active" : "") + '" data-gallery-to="' + index + '" aria-label="Show image ' + (index + 1) + '"></button>'; }).join("") + '</div><button type="button" data-gallery-next aria-label="Next image">›</button></div>',
      '</div>',
      '<div class="purchase-panel model-x-purchase-panel">',
      '<h1>Model X</h1>',
      '<div class="price-tabs" role="tablist">' + ["cash", "lease", "finance"].map(function (mode) { return '<button type="button" class="' + (config.mode === mode ? "is-active" : "") + '" data-mode="' + mode + '" role="tab">' + mode[0].toUpperCase() + mode.slice(1) + '</button>'; }).join("") + '</div>',
      '<div class="vehicle-stats"><div><strong>328<span>mi</span></strong><small>Range (EPA est.)</small></div><div><strong>155<span>mph</span></strong><small>Top Speed</small></div><div><strong>4.4<span>sec</span></strong><small>0–60 mph</small></div></div>',
      '<article class="model-x-listing"><div class="model-x-listing-heading"><strong>Long Range</strong><b>' + (config.mode === "finance" ? "$606 /mo" : "$35,600") + '</b></div><p>2019 Certified Pre-Owned Vehicle with 93,869 mi</p><p class="model-x-vin">VIN 5YJX CDE26KF182881</p><ul><li><span class="model-x-swatch silver"></span>Midnight Silver Metallic Paint</li><li><span class="model-x-wheel">◉</span>20&quot; Silver Wheels</li><li><span class="model-x-swatch black"></span>All Black Premium Interior with Figured Ash Wood Décor</li><li><span class="model-x-feature-icon">⌂</span>Five Seat Interior</li><li><span class="model-x-feature-icon">◉</span>Traffic-Aware Cruise Control and Autosteer</li><li><span class="model-x-feature-icon">▥</span>1 mo Premium Connectivity Trial</li><li><span class="model-x-feature-icon">◉</span>1 mo Full Self-Driving (Supervised) Trial</li></ul></article>',
      '<button class="wide-link" type="button" data-action="trade">Get Trade-In Value</button>',
      '<p class="savings-note">Up to <u>$6,500 potential savings</u> after delivery available</p>',
      '</div>',
      '</section>',
      '<section class="feature-stack model-x-stack" id="features">',
      modelXSelfDrivingMarkup(),
      '<article class="config-card model-x-warranty"><div class="sub-heading"><h2>Warranty</h2><a class="underlined" href="#warranty">Learn More</a></div><h3>Used Vehicle Limited Warranty</h3><p>1 year / 10,000 miles<br>Starting from your delivery date</p><h3>Battery and Drive Unit Limited Warranty</h3><p>June 2027 / unlimited mileage coverage</p></article>',
      '<article class="config-card" id="charging"><div class="card-heading"><h2>Charging</h2><p>Every Tesla includes access to the largest global Supercharging network</p></div><div class="sub-heading"><strong>Home Charging</strong><a href="https://www.tesla.com/support/charging/home-charging" target="_blank" rel="noopener">Learn More</a></div><label class="option-row boxed charging-option"><input type="checkbox" data-option="wall" ' + (config.wall ? "checked" : "") + '><span><strong>Wall Connector</strong><small>Adds up to 44 mi of range/hr.<br>Installation required.</small></span><b>$585</b></label><div class="included-row"><div><strong>Mobile Connector</strong><small>Adds up to 30 mi of range/hr.<br>Works with any outlet.</small></div><b>✓ &nbsp;Included</b></div></article>',
      '<article class="config-card interior-card"><h2>Interior</h2><div class="option-heading"><div><strong>All Black Premium Interior</strong><small>Figured Ash Wood Décor · Five Seat Interior</small></div><span>Included</span></div><div class="interior-swatch model-x-black-swatch"></div><h3>Falcon Wing Doors</h3><a href="#interior" class="underlined">Compare Seating</a></article>',
      '<article class="config-card accessories-card" id="accessories"><div class="sub-heading"><h2>Accessories</h2><a href="https://shop.tesla.com/" target="_blank" rel="noopener">Learn More</a></div>' + accessories.map(function (item) { return '<label class="option-row boxed accessory-row"><input type="checkbox" data-accessory="' + item.id + '" ' + (config.accessories[item.id] ? "checked" : "") + '><span>' + esc(item.name) + '</span><b>$' + item.price.toLocaleString("en-US") + '</b></label>'; }).join("") + '</article>',
      '</section>',
      '',
      stickyBar()
    ].join("");
  }

  function modelXSelfDrivingMarkup() {
    return '<article class="config-card self-driving-card"><h2>Full Self-Driving (Supervised)</h2><p>Your vehicle will be able to drive itself almost anywhere with minimal driver intervention</p><label class="option-row"><input type="checkbox" data-option="fsd" ' + (config.fsd ? "checked" : "") + '><span>Monthly Subscription</span><b>$99 /mo</b></label><div class="model-x-video"><video controls muted playsinline preload="metadata"><source src="' + ASSET + 'model-x-fsd.webm" type="video/webm"></video><div><strong>Full Self-Driving</strong><small>(Supervised)<br>Daily Driving &amp;<br>Avoiding Collisions</small></div></div><small class="disclosure">Subscription starts after 1 mo trial<br><br>Currently enabled features require active driver supervision and do not make the vehicle autonomous.</small></article>';
  }

  function model3Markup() {
    var activeGallery = model3Gallery;
    return [
      '<section id="model" class="model-configurator model3-configurator">',
      '<div class="model3-offer">Model 3 Premium &amp; Performance: <span>1.99% APR Available</span> <u>Order Now</u><small>● ●</small></div>',
      '<div class="model-gallery">',
      '<button class="chat-button" type="button" data-action="chat" aria-label="Chat with Tesla Trade">▢<span>•••</span></button>',
      '<div class="gallery-stage">' + activeGallery.map(function (item, index) {
        return '<img class="gallery-image ' + (index === galleryIndex ? "is-active" : "") + '" data-gallery="' + index + '" src="' + ASSET + item.src + '" alt="' + esc(item.alt) + '">';
      }).join("") + '</div>',
      '<div class="gallery-controls"><button type="button" data-gallery-prev aria-label="Previous image">‹</button><div class="gallery-dots">' + activeGallery.map(function (_, index) { return '<button type="button" class="' + (index === galleryIndex ? "is-active" : "") + '" data-gallery-to="' + index + '" aria-label="Show image ' + (index + 1) + '"></button>'; }).join("") + '</div><button type="button" data-gallery-next aria-label="Next image">›</button></div>',
      '</div>',
      '<div class="purchase-panel model3-purchase-panel"><h1>Model 3</h1><div class="price-tabs" role="tablist">' + ["cash", "lease", "finance"].map(function (mode) { return '<button type="button" class="' + (config.mode === mode ? "is-active" : "") + '" data-mode="' + mode + '" role="tab">' + mode[0].toUpperCase() + mode.slice(1) + '</button>'; }).join("") + '</div><div class="vehicle-stats"><div><strong>363<span>mi</span></strong><small>Range (EPA est.)</small></div><div><strong>4.9<span>sec</span></strong><small>0–60 mph</small></div><div><strong>250<span>kW</span></strong><small>Max Supercharging</small></div></div><div class="model3-drive-tabs"><button type="button" class="' + (config.drive === "awd" ? "is-active" : "") + '" data-drive="awd">All-Wheel Drive</button><button type="button" class="' + (config.drive === "rwd" ? "is-active" : "") + '" data-drive="rwd">Rear-Wheel Drive</button></div><div class="model3-price-row"><strong>' + (config.mode === "finance" ? money(financeTotal()) + " /mo" : money(cashTotal())) + '</strong><span>Model 3 Premium</span></div></div>',
      '</section>',
      '<section class="model3-content" id="features"><article class="model3-feature-intro"><h2>The Future of Travel Is Autonomous</h2><p>Equipped with active safety features including Automatic Emergency Braking when obstacles get too close and Lane Departure Avoidance to keep you in your lane. Upgrade to Full Self-Driving (Supervised) to unlock more features. <u>Learn More</u></p></article>',
      '<div class="model3-feature-grid"><article><span class="feature-icon">◉</span><h3>Full Self-Driving<br>(Supervised)</h3><p>A suite of advanced driver-assistance features designed to provide more active guidance and assisted driving under your active supervision.</p></article><article><span class="feature-icon">▣</span><h3>Front-Facing<br>Cameras</h3><p>Enhanced visibility for greater safety, easier parking and autonomous features like Actually Smart Summon.</p></article><article><span class="feature-icon">◉</span><h3>Blind Spot<br>Monitoring</h3><p>Illuminated warning lights and on-screen visualizations help you safely check your surroundings.</p></article></div>',
      '<article class="model3-specs"><h2>Drive</h2><div class="spec-grid"><div><small>Range (EPA est.)</small><strong>363 mi</strong></div><div><small>Acceleration</small><strong>4.9 s 0–60 mph</strong></div><div><small>Drive</small><strong>' + (config.drive === "awd" ? "All-Wheel Drive" : "Rear-Wheel Drive") + '</strong></div></div><hr><h2>Dimensions</h2><img src="' + ASSET + 'model-3-specs.png" alt="Model 3 dimensions"><div class="spec-grid"><div><small>Weight (Curb Mass)</small><strong>3,759 lbs</strong></div><div><small>Cargo</small><strong>24 cu ft</strong></div><div><small>Wheels</small><strong>18&quot; or 19&quot;</strong></div><div><small>Seating</small><strong>5 seats</strong></div><div><small>Displays</small><strong>15.4&quot; Center Touchscreen<br>8&quot; Rear Touchscreen</strong></div><div><small>Ground Clearance</small><strong>5.4&quot;</strong></div></div></article>',
      '<article class="model3-dark-details" id="charging"><h2>Charging</h2><div class="spec-grid"><div><small>Supercharging Max/Payment Type</small><strong>250 kW Max; Pay Per Use</strong></div><div><small>Charging Speed</small><strong>Up to 185 miles added in 15 minutes²</strong></div></div><hr><h2>Warranty</h2><div class="spec-grid"><div><small>Basic Vehicle</small><strong>4 years or 50,000 mi, whichever comes first</strong></div><div><small>Battery &amp; Drive Unit</small><strong>8 years or 120,000 mi, whichever comes first</strong></div></div><hr><h2>Other</h2><div class="other-links"><u>Owner&apos;s Manual</u><u>Compare Models</u></div><p class="model3-disclosure">Vehicle shown for illustrative purposes only. Actual model may vary.<br><br>² Range added in 15 minutes is based on <u>constant speed data</u>.<br><br>³ Full Self-Driving (Supervised) requires the driver to remain attentive at all times and does not make the vehicle autonomous.</p></article></section>',
      stickyBar()
    ].join("");
  }

  function cybertruckMarkup() {
    var activeGallery = cybertruckGallery;
    var trim = config.cyberTrim;
    return [
      '<section id="model" class="model-configurator cybertruck-configurator">',
      '<div class="model-gallery cybertruck-gallery"><div class="cybertruck-wordmark">CYBERTRUCK</div><button class="chat-button" type="button" data-action="chat" aria-label="Chat with Tesla Trade">▢<span>•••</span></button><div class="gallery-stage">' + activeGallery.map(function (item, index) {
        return '<img class="gallery-image ' + (index === galleryIndex ? "is-active" : "") + '" data-gallery="' + index + '" src="' + ASSET + item.src + '" alt="' + esc(item.alt) + '">';
      }).join("") + '</div><div class="gallery-controls"><button type="button" data-gallery-prev aria-label="Previous image">‹</button><div class="gallery-dots">' + activeGallery.map(function (_, index) { return '<button type="button" class="' + (index === galleryIndex ? "is-active" : "") + '" data-gallery-to="' + index + '" aria-label="Show image ' + (index + 1) + '"></button>'; }).join("") + '</div><button type="button" data-gallery-next aria-label="Next image">›</button></div></div>',
      '<div class="purchase-panel cybertruck-purchase"><div class="price-tabs" role="tablist">' + ["cash", "lease", "finance"].map(function (mode) { return '<button type="button" class="' + (config.mode === mode ? "is-active" : "") + '" data-mode="' + mode + '" role="tab">' + mode[0].toUpperCase() + mode.slice(1) + '</button>'; }).join("") + '</div><div class="vehicle-stats cyber-stats"><div><strong>325<span>mi</span></strong><small>Range (EPA est.)</small></div><div><strong>11,000<span>lbs</span></strong><small>Towing capacity</small></div><div><strong>4.1<span>sec</span></strong><small>0–60 mph</small></div></div><div class="cyber-trims"><label class="cyber-trim ' + (trim === "dual" ? "is-selected" : "") + '"><input type="radio" name="cyber-trim" value="dual" data-cyber-trim><span>Dual Motor All-Wheel Drive</span><b>$74,990</b></label><label class="cyber-trim ' + (trim === "premium" ? "is-selected" : "") + '"><input type="radio" name="cyber-trim" value="premium" data-cyber-trim><span>Premium All-Wheel Drive</span><b>$84,990</b></label><label class="cyber-trim ' + (trim === "beast" ? "is-selected" : "") + '"><input type="radio" name="cyber-trim" value="beast" data-cyber-trim><span>Cyberbeast</span><b>$99,990</b></label></div><button class="wide-link" type="button" data-action="compare">Compare Models <span>›</span></button><p class="cyber-tax-note">Business tax deductions available. <u>Terms</u></p><button class="wide-link trade-link" type="button" data-action="trade">Get Trade-In Value</button><p class="savings-note">Up to <u>$8,000 potential savings</u> after delivery available</p><button class="wide-link explore-link" type="button" data-action="scroll-features">▸ &nbsp; Explore Cybertruck Features</button></div>',
      '</section>',
      '<section class="feature-stack cybertruck-stack" id="features">',
      '<article class="config-card self-driving-card"><h2>Full Self-Driving (Supervised)</h2><p>Your vehicle will be able to drive itself almost anywhere with minimal driver intervention</p><label class="option-row"><input type="checkbox" data-option="fsd" ' + (config.fsd ? "checked" : "") + '><span>Monthly Subscription</span><b>$99 /mo</b></label><div class="video-row"><div class="video-thumb"><img src="' + ASSET + 'cybertruck-interior.png" alt=""><span>▶</span></div><div><strong>Full Self-Driving</strong><small>(Supervised)<br>Daily Driving &amp;<br>Avoiding Collisions</small></div></div><small class="disclosure">Subscription starts after 1 mo trial<br><br>Currently enabled features require active driver supervision.</small></article>',
      '<article class="config-card cyber-exterior" id="exterior"><h2>Exterior</h2><div class="option-heading"><div><strong>20&quot; Core Wheels</strong><small>With All-Season Tires<br>Range (EPA est.): 325 mi</small></div><span>Included</span></div><div class="wheel-row"><button class="wheel-swatch is-selected" data-wheel="core"><img src="' + ASSET + 'cybertruck-wheel.jpeg" alt="Cybertruck core wheel"></button><button class="wheel-swatch" data-wheel="mantle"><img src="' + ASSET + 'cybertruck-wheel.jpeg" alt="Cybertruck mantle wheel"></button></div><div class="option-heading tow-heading"><div><strong>6&apos;x4&apos; Truck Bed</strong><small>Composite bed that doesn&apos;t need a liner<br>Motorized Hardtop Tonneau Cover<br>Gear Locker, Under Bed</small></div><a class="underlined" href="#towing">View Details</a></div><div class="cyber-media"><img src="' + ASSET + 'cybertruck-towing.jpg" alt="Cybertruck towing a turbine"></div><div class="option-heading cyber-terrestrial" id="towing"><div><strong>Terrestrial Armor Package</strong><small>Underbody battery shield and heavy-duty rock sliders for superior protection against rugged terrain, rough roads and curbs.</small></div><a class="underlined" href="#terrestrial">Learn More</a></div><label class="option-row boxed"><input type="checkbox" data-cyber-option="armor" ' + (config.armor ? "checked" : "") + '><span>Terrestrial Armor Package</span><b>$3,000</b></label><p class="image-note">Image shows Mantle wheels, sold separately.</p></article>',
      '<article class="config-card cyber-interior"><h2>Interior <a class="underlined" href="#interior">Learn More</a></h2><div class="option-heading"><strong>Tactical Grey Décor</strong><span>Included</span></div><div class="interior-hero"><img src="' + ASSET + 'cybertruck-interior.png" alt="Cybertruck tactical grey interior"></div><div class="cyber-swatch-row"><button class="cyber-swatch cyber-swatch-dark is-selected" aria-label="Tactical Grey"></button><button class="cyber-swatch cyber-swatch-light" aria-label="White interior"></button></div></article>',
      '<article class="config-card cyber-charging" id="charging"><div class="card-heading"><h2>Charging</h2><p>Every Tesla includes access to the largest global Supercharging network</p></div><div class="sub-heading"><strong>Home Charging</strong><a href="https://www.tesla.com/support/charging/home-charging" target="_blank" rel="noopener">Learn More</a></div><label class="option-row boxed"><input type="checkbox" data-cyber-option="universal" ' + (config.universal ? "checked" : "") + '><span><strong>Universal Wall Connector</strong><small>Charge any electric vehicle.<br>Adds up to 44 mi of range/hr.<br>Installation required.</small></span><b>$660</b></label><div class="included-row"><div><strong>Mobile Connector</strong><small>Adds up to 30 mi of range/hr.<br>Works with any outlet.</small></div><b>✓ &nbsp;Included</b></div><div class="cyber-media"><img src="' + ASSET + 'cybertruck-charging.jpg" alt="Cybertruck charging"></div></article>',
      '<article class="config-card powershare-card"><div class="sub-heading"><div><h2>PowerShare Bundles</h2><p>Share power from Cybertruck</p></div><a href="#powershare" class="underlined">Learn More</a></div><div class="cyber-media"><img src="' + ASSET + 'cybertruck-powershare.jpg" alt="Cybertruck Powershare"></div><label class="option-row boxed"><input type="checkbox" data-cyber-option="powershare" ' + (config.powershare ? "checked" : "") + '><span><strong>$1,970<br>Universal Home Charger &amp; Gateway</strong><small>Power your home off-grid for over 3 days with Cybertruck*</small></span><b></b></label><label class="option-row boxed"><input type="checkbox" data-cyber-option="adapter" ' + (config.adapter ? "checked" : "") + '><span><strong>$80<br>Outlet Adapter</strong><small>Power devices from your Cybertruck**</small></span><b></b></label><p class="cyber-disclosure">*Installation required. Contact a <u>certified installer</u> to get a quote. Estimate based on 30 kWh energy use per day.<br><br>**PowerShare Outlet Adapter only compatible with Cybertruck, and PowerShare enabled Mobile Chargers.</p></article>',
      '<article class="config-card accessories-card cyber-accessories" id="accessories"><div class="sub-heading"><h2>Accessories</h2><a href="https://shop.tesla.com/" target="_blank" rel="noopener">Learn More</a></div><video class="accessory-video" autoplay muted loop playsinline controls><source src="' + ASSET + 'cybertruck-accessories.webm" type="video/webm"></video>' + [{ id: "projection", name: "Projection Lights", price: 75 }, { id: "underseat", name: "Underseat Storage Bin", price: 250 }, { id: "cyber-liners", name: "All-Weather Interior Liners", price: 295 }, { id: "cyber-cooler", name: "Cooler", price: 550 }, { id: "crossbars", name: "Crossbars", price: 800 }].map(function (item) { return '<label class="option-row boxed accessory-row"><input type="checkbox" data-cyber-accessory="' + item.id + '" ' + (config.accessories[item.id] ? "checked" : "") + '><span>' + item.name + '</span><b>$' + item.price.toLocaleString("en-US") + '</b></label>'; }).join("") + '</article>',
      '</section>',
      '',
      stickyBar()
    ].join("");
  }

  function trimsMarkup() {
    return '<div class="trim-list"><article class="trim-card trim-card-selected"><div class="trim-card-title"><strong>Model Y</strong><span>' + (config.mode === "finance" ? money(financeTotal()) + " /mo" : money(cashTotal())) + '</span></div><label class="radio-row"><input type="radio" name="drive" value="rwd" ' + (config.drive === "rwd" ? "checked" : "") + '><span>Rear-Wheel Drive</span><b>' + (config.mode === "finance" ? "$559 /mo" : "$39,990") + '</b></label><label class="radio-row"><input type="radio" name="drive" value="awd" ' + (config.drive === "awd" ? "checked" : "") + '><span>All-Wheel Drive</span><b>' + (config.mode === "finance" ? "$588 /mo" : "$41,990") + '</b></label><button class="feature-link" type="button" data-action="scroll-features">View Features <span>›</span></button></article>' +
      '<article class="trim-card"><div class="trim-card-title"><strong>Model Y <em>Premium</em></strong><span>From ' + (config.mode === "finance" ? "$646 /mo" : "$45,990") + '</span></div><small>Rear-Wheel &amp; All-Wheel Drive</small></article>' +
      '<article class="trim-card"><div class="trim-card-title"><strong>Model Y L <em>Premium</em></strong><span>' + (config.mode === "finance" ? "$992 /mo" : "$61,990") + '</span></div><small>Long Wheelbase, All-Wheel Drive</small><div class="launch-badge">LAUNCH <small>SERIES</small> <u>Learn More</u></div></article>' +
      '<article class="trim-card"><div class="trim-card-title"><strong>Model Y <em>Performance</em></strong><span>' + (config.mode === "finance" ? "$884 /mo" : "$57,990") + '</span></div><small>All-Wheel Drive</small></article>' +
      '<button class="wide-link" type="button" data-action="compare">Compare Models <span>›</span></button><button class="wide-link trade-link" type="button" data-action="trade">Get Trade-In Value</button><p class="savings-note">Up to <u>$5,500 potential savings</u> after delivery available</p></div>';
  }

  function selfDrivingMarkup() {
    return '<article class="config-card self-driving-card"><h2>Full Self-Driving (Supervised)</h2><p>Your vehicle will be able to drive itself almost anywhere with minimal driver intervention</p><label class="option-row"><input type="checkbox" data-option="fsd" ' + (config.fsd ? "checked" : "") + '><span>Monthly Subscription</span><b>$99 /mo</b></label><div class="video-row"><div class="video-thumb"><img src="' + ASSET + 'model-y-interior-front.jpeg" alt=""><span>▶</span></div><div><strong>Full Self-Driving</strong><small>(Supervised)<br>Daily Driving &amp;<br>Avoiding Collisions</small></div></div><small class="disclosure">Subscription starts after 1 mo trial<br><br>Currently enabled features require active driver supervision and do not make the vehicle autonomous.</small></article>';
  }

  function exteriorMarkup() {
    return '<article class="config-card" id="exterior"><h2>Exterior</h2><div class="option-heading"><strong>Stealth Grey</strong><span>Included</span></div><div class="swatch-row"><button class="swatch color-stealth ' + (config.color === "stealth" ? "is-selected" : "") + '" data-color="stealth" aria-label="Stealth Grey"></button><button class="swatch color-pearl ' + (config.color === "pearl" ? "is-selected" : "") + '" data-color="pearl" aria-label="Pearl White"></button><button class="swatch color-black ' + (config.color === "black" ? "is-selected" : "") + '" data-color="black" aria-label="Solid Black"></button></div><div class="option-heading wheels-heading"><div><strong>18&quot; Aperture Wheels</strong><small>All-Season Tires<br>Range (EPA est.): 321 mi</small></div><span>Included</span></div><div class="wheel-row"><button class="wheel-swatch is-selected" data-wheel="aperture"><img src="' + ASSET + 'model-y-wheel.jpeg" alt="Aperture wheels"></button><button class="wheel-swatch" data-wheel="nova"><img src="' + ASSET + 'model-y-wheel.jpeg" alt="Nova wheels"></button></div><div class="option-heading tow-heading"><div><strong>Tow Hitch</strong><small>Tow up to 3,500 lbs with a class II steel tow bar</small></div></div><label class="option-row boxed"><input type="checkbox" data-option="tow" ' + (config.tow ? "checked" : "") + '><span>Tow Hitch</span><b>$1,000</b></label></article>';
  }

  function interiorMarkup() {
    return '<article class="config-card interior-card"><h2>Interior</h2><div class="option-heading"><div><strong>All Black</strong><small>Textile decor</small></div><span>Included</span></div><div class="interior-swatch"></div><h3>Five Seat Layout</h3><a href="#interior" class="underlined">Compare Seating</a></article>';
  }

  function chargingMarkup() {
    return '<article class="config-card" id="charging"><div class="card-heading"><div><h2>Charging</h2><p>Every Tesla includes access to the largest global Supercharging network</p></div></div><div class="sub-heading"><strong>Home Charging</strong><a href="https://www.tesla.com/support/charging/home-charging" target="_blank" rel="noopener">Learn More</a></div><label class="option-row boxed charging-option"><input type="checkbox" data-option="wall" ' + (config.wall ? "checked" : "") + '><span><strong>Wall Connector</strong><small>Adds up to 44 mi of range/hr.<br>Installation required.</small></span><b>$585</b></label><div class="included-row"><div><strong>Mobile Connector</strong><small>Adds up to 30 mi of range/hr.<br>Works with any outlet.</small></div><b>✓ &nbsp;Included</b></div></article>';
  }

  function accessoriesMarkup() {
    return '<article class="config-card accessories-card" id="accessories"><div class="sub-heading"><h2>Accessories</h2><a href="https://shop.tesla.com/" target="_blank" rel="noopener">Learn More</a></div>' + accessories.map(function (item) { return '<label class="option-row boxed accessory-row"><input type="checkbox" data-accessory="' + item.id + '" ' + (config.accessories[item.id] ? "checked" : "") + '><span>' + esc(item.name) + '</span><b>$' + item.price.toLocaleString("en-US") + '</b></label>'; }).join("") + '</article>';
  }

  function stickyBar() {
    var primary = config.mode === "finance" ? money(financeTotal()) + " /mo" : money(cashTotal());
    var label = config.mode === "finance" ? "Est. Financing" : "Vehicle Price";
    var actionLabel = config.mode === "cash" ? "Continue to payment" : "Request quote";
    return '<div class="sticky-bar"><div><strong>' + primary + ' <span class="down-chevron">⌄</span></strong><small>' + label + '</small></div><button class="order-button" type="button" data-action="order-now">' + actionLabel + '</button></div>';
  }

  function financeFormMarkup() {
    var vehicleOptions = catalog.filter(function (item) { return item.category === "Vehicles"; });
     var selectedId = vehicle === "model-x" ? "model-x" : vehicle === "model-s" ? "model-s" : vehicle === "model-3" ? "model-3" : vehicle === "cybertruck" ? "cybertruck" : "model-y";
    var selectedProduct = vehicleOptions.find(function (item) { return item.id === selectedId; });
    var initialPrice = selectedProduct && selectedProduct.price ? selectedProduct.price : 39990;
    var options = vehicleOptions.map(function (item) { return '<option value="' + esc(item.id) + '" ' + (item.id === selectedId ? "selected" : "") + '>' + esc(item.name) + '</option>'; }).join("");
     return '<section id="finance" class="finance-section"><div class="finance-copy"><span class="section-label">FINANCING</span><h2>Explore the payment before you commit.</h2><p>Adjust the price, down payment and term, then request a quote from the distributor desk. This calculator is illustrative, not a credit offer.</p></div><div class="finance-card"><form id="finance-form"><div class="finance-grid"><label>Vehicle<select id="finance-model" name="model">' + options + '</select></label><label>Vehicle price<input id="finance-price" name="vehiclePrice" type="number" min="0" step="100" value="' + initialPrice + '"></label><label>Down payment<input id="finance-down" name="downPayment" type="number" min="0" step="100" value="0"></label><label>Term<select id="finance-term" name="termMonths"><option value="36">36 months</option><option value="48">48 months</option><option value="60">60 months</option><option value="72" selected>72 months</option><option value="84">84 months</option></select></label><label>Estimated APR<input id="finance-apr" name="apr" type="number" min="0" max="100" step="0.1" value="0"></label></div><div class="finance-estimate"><span>Illustrative monthly payment</span><strong id="finance-payment">$556 <small>/ month</small></strong></div><div class="finance-contact-grid"><label>Full name<input id="finance-name" name="name" required autocomplete="name"></label><label>Email<input id="finance-email" name="email" type="email" required autocomplete="email"></label><label>Phone<input id="finance-phone" name="phone" required autocomplete="tel"></label></div><label class="consent"><input type="checkbox" name="consent" required><span>I understand this is an estimate and consent to be contacted about approved financing options.</span></label><button class="black-button submit-finance" type="submit">Request quote</button><p class="finance-message" id="finance-message" role="status"></p></form></div></section>';
  }

  function bindEvents() {
    app.querySelectorAll("[data-mode]").forEach(function (button) {
      button.addEventListener("click", function () {
        config.mode = button.getAttribute("data-mode");
        rerenderConfigurator();
      });
    });
    app.querySelectorAll("[data-vehicle]").forEach(function (button) {
      button.addEventListener("click", function () {
        vehicle = button.getAttribute("data-vehicle");
        galleryIndex = 0;
        render();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });
    app.querySelectorAll("[data-drive]").forEach(function (button) {
      button.addEventListener("click", function () { config.drive = button.getAttribute("data-drive"); rerenderConfigurator(); });
    });
    app.querySelectorAll("[data-cyber-trim]").forEach(function (input) {
      input.addEventListener("change", function () { config.cyberTrim = input.value; rerenderConfigurator(); });
    });
    app.querySelectorAll("[name=drive]").forEach(function (input) {
      input.addEventListener("change", function () { config.drive = input.value; rerenderConfigurator(); });
    });
    app.querySelectorAll("[data-option]").forEach(function (input) {
      input.addEventListener("change", function () { config[input.getAttribute("data-option")] = input.checked; rerenderConfigurator(); });
    });
    app.querySelectorAll("[data-accessory]").forEach(function (input) {
      input.addEventListener("change", function () { config.accessories[input.getAttribute("data-accessory")] = input.checked; rerenderConfigurator(); });
    });
    app.querySelectorAll("[data-cyber-option]").forEach(function (input) {
      input.addEventListener("change", function () { config[input.getAttribute("data-cyber-option")] = input.checked; rerenderConfigurator(); });
    });
    app.querySelectorAll("[data-cyber-accessory]").forEach(function (input) {
      input.addEventListener("change", function () { config.accessories[input.getAttribute("data-cyber-accessory")] = input.checked; rerenderConfigurator(); });
    });
    app.querySelectorAll("[data-color]").forEach(function (button) {
      button.addEventListener("click", function () { config.color = button.getAttribute("data-color"); updateChoiceState(); });
    });
    app.querySelectorAll("[data-wheel]").forEach(function (button) {
      button.addEventListener("click", function () { config.wheels = button.getAttribute("data-wheel"); updateChoiceState(); });
    });
    app.querySelectorAll("[data-action]").forEach(function (button) {
      button.addEventListener("click", function () {
        var action = button.getAttribute("data-action");
        if (action === "open-cart" || action === "order-now") openOrderFlow();
        if (action === "close-cart") closeCart();
        if (action === "scroll-features") document.getElementById("features").scrollIntoView({ behavior: "smooth" });
         if (action === "chat") window.alert("A distributor specialist will be available to help confirm your " + (vehicle === "model-x" ? "Model X" : vehicle === "model-s" ? "Model S" : vehicle === "cybertruck" ? "Cybertruck" : vehicle === "model-3" ? "Model 3" : "Model Y") + " configuration.");
        if (action === "country") window.alert("Market selection is currently set to US.");
        if (action === "compare") window.alert("Model comparison is coming soon. The Model Y trims are listed above.");
        if (action === "trade") window.alert("Trade-in valuation will be confirmed by the distributor desk with your quote.");
        if (action === "prequalify") window.alert("Pre-qualification will be confirmed by the distributor desk with your quote.");
      });
    });
    app.querySelectorAll("[data-gallery-to]").forEach(function (button) {
      button.addEventListener("click", function () { setGallery(Number(button.getAttribute("data-gallery-to"))); });
    });
    var previous = app.querySelector("[data-gallery-prev]");
    var next = app.querySelector("[data-gallery-next]");
    if (previous) previous.addEventListener("click", function () { setGallery((galleryIndex + currentGalleryLength() - 1) % currentGalleryLength()); });
    if (next) next.addEventListener("click", function () { setGallery((galleryIndex + 1) % currentGalleryLength()); });
    bindFinance();
  }

  function rerenderConfigurator() {
    var model = document.getElementById("model");
    if (!model) return;
    var replacement = document.createElement("div");
    replacement.innerHTML = modelYMarkup();
    model.replaceWith(replacement.firstElementChild);
    bindEvents();
    updateStickyBar();
  }

  function updateChoiceState() {
    app.querySelectorAll("[data-color]").forEach(function (button) { button.classList.toggle("is-selected", button.getAttribute("data-color") === config.color); });
    app.querySelectorAll("[data-wheel]").forEach(function (button) { button.classList.toggle("is-selected", button.getAttribute("data-wheel") === config.wheels); });
  }

  function updateStickyBar() {
    var bar = app.querySelector(".sticky-bar");
    if (!bar) return;
    bar.outerHTML = stickyBar();
    var button = app.querySelector(".sticky-bar [data-action=order-now]");
    if (button) button.addEventListener("click", openOrderFlow);
  }

  function setGallery(index) {
    galleryIndex = index;
    app.querySelectorAll("[data-gallery]").forEach(function (image) { image.classList.toggle("is-active", Number(image.getAttribute("data-gallery")) === index); });
    app.querySelectorAll("[data-gallery-to]").forEach(function (button) { button.classList.toggle("is-active", Number(button.getAttribute("data-gallery-to")) === index); });
  }

  function currentGalleryLength() {
     return vehicle === "model-x" ? modelXGallery.length : vehicle === "model-s" ? modelSGallery.length : vehicle === "model-3" ? model3Gallery.length : vehicle === "cybertruck" ? cybertruckGallery.length : gallery.length;
  }

  function startSlides() {
    clearInterval(slideTimer);
    slideTimer = setInterval(function () { setGallery((galleryIndex + 1) % currentGalleryLength()); }, 7000);
  }

  function bindFinance() {
    var form = document.getElementById("finance-form");
    if (!form || form.dataset.bound === "true") return;
    form.dataset.bound = "true";
    ["finance-price", "finance-down", "finance-term", "finance-apr"].forEach(function (id) {
      var input = document.getElementById(id);
      if (input) {
        input.addEventListener("input", updateFinanceEstimate);
        input.addEventListener("change", updateFinanceEstimate);
      }
    });
    var model = document.getElementById("finance-model");
    if (model) model.addEventListener("change", function () {
      var product = catalog.find(function (item) { return item.id === model.value; });
      if (product && Number(product.price) > 0) document.getElementById("finance-price").value = Number(product.price);
      updateFinanceEstimate();
    });
    form.addEventListener("submit", submitFinance);
    updateFinanceEstimate();
  }

  function updateFinanceEstimate() {
    var price = Math.max(0, Number(document.getElementById("finance-price") && document.getElementById("finance-price").value) || 0);
    var down = Math.min(price, Math.max(0, Number(document.getElementById("finance-down") && document.getElementById("finance-down").value) || 0));
    var term = Math.max(12, Number(document.getElementById("finance-term") && document.getElementById("finance-term").value) || 72);
    var apr = Math.max(0, Number(document.getElementById("finance-apr") && document.getElementById("finance-apr").value) || 0);
    var principal = Math.max(0, price - down);
    var monthlyRate = apr / 100 / 12;
    var payment = monthlyRate ? principal * monthlyRate / (1 - Math.pow(1 + monthlyRate, -term)) : principal / term;
    var output = document.getElementById("finance-payment");
    if (output) output.innerHTML = money(payment) + ' <small>/ month</small>';
  }

  function submitFinance(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var message = form.querySelector("#finance-message");
    var data = new FormData(form);
    var price = Math.max(0, Number(data.get("vehiclePrice")) || 0);
    var down = Math.max(0, Number(data.get("downPayment")) || 0);
    var term = Number(data.get("termMonths")) || 72;
    var apr = Math.max(0, Number(data.get("apr")) || 0);
    var principal = Math.max(0, price - down);
    var monthlyRate = apr / 100 / 12;
    var monthly = monthlyRate ? principal * monthlyRate / (1 - Math.pow(1 + monthlyRate, -term)) : principal / term;
    var vehicle = catalog.find(function (item) { return item.id === data.get("model"); });
    var payload = {
      name: data.get("name"), email: data.get("email"), phone: data.get("phone"),
      model: vehicle ? vehicle.name : data.get("model"), vehiclePrice: price,
      downPayment: Math.min(price, down), termMonths: term, apr: apr,
      estimatedMonthly: Number(monthly.toFixed(2)), consent: data.get("consent") === "on"
    };
    var submit = form.querySelector(".submit-finance");
    submit.disabled = true; submit.textContent = "Sending…"; message.className = "finance-message"; message.textContent = "";
    fetch("api/finance-inquiry.php", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload) })
      .then(function (response) { return response.json().then(function (json) { if (!response.ok) throw new Error(json.error || "The finance request could not be sent."); return json; }); })
      .then(function () { window.location.href = "confirmation.html?type=finance"; })
      .catch(function (error) { message.className = "finance-message error"; message.textContent = error.message; })
      .finally(function () { submit.disabled = false; submit.textContent = "Request quote"; });
  }

  function cartCount() {
    return cart.reduce(function (sum, item) { return sum + item.quantity; }, 0);
  }

  function updateCartCount() {
    app.querySelectorAll(".cart-count").forEach(function (node) { node.textContent = cartCount(); });
    renderDrawer();
  }

  function openOrderFlow() {
    if (config.mode === "finance") {
      var financeSection = document.getElementById("finance");
      if (financeSection) {
        financeSection.scrollIntoView({ behavior: "smooth" });
        var financeName = document.getElementById("finance-name");
        if (financeName) window.setTimeout(function () { financeName.focus(); }, 350);
      }
      return;
    }
     var productId = vehicle === "model-x" ? "model-x" : vehicle === "model-s" ? "model-s" : vehicle === "model-3" ? "model-3" : vehicle === "cybertruck" ? "cybertruck" : "model-y";
    var model = catalog.find(function (item) { return item.id === productId; });
    if (model && !cart.some(function (item) { return item.id === productId; })) cart.push({ id: model.id, quantity: 1 });
    persistCart();
    updateCartCount();
    openCart();
    var countrySelect = document.getElementById("delivery-country");
    if (countrySelect && !config.country) {
      window.setTimeout(function () { countrySelect.focus(); }, 150);
    }
  }

  function cartProducts() {
    return cart.map(function (line) {
      var product = catalog.find(function (item) { return item.id === line.id; });
      return product ? { product: product, quantity: line.quantity } : null;
    }).filter(Boolean);
  }

  function openCart() {
    var drawer = app.querySelector(".drawer");
    var backdrop = app.querySelector(".drawer-backdrop");
    if (!drawer) return;
    drawer.classList.add("is-open"); backdrop.classList.add("is-open"); drawer.setAttribute("aria-hidden", "false");
    renderDrawer();
  }

  function closeCart() {
    var drawer = app.querySelector(".drawer");
    var backdrop = app.querySelector(".drawer-backdrop");
    if (!drawer) return;
    drawer.classList.remove("is-open"); backdrop.classList.remove("is-open"); drawer.setAttribute("aria-hidden", "true");
  }

  function renderDrawer() {
    var node = document.getElementById("drawer-content");
    if (!node) return;
    var lines = cartProducts();
    if (!lines.length) {
      node.innerHTML = '<div class="empty-cart"><p>Your quote list is empty.</p><p>Choose a vehicle configuration to start a request.</p><a class="black-button" href="#model" data-action="close-cart">Back to vehicle</a></div>';
      bindDrawerActions();
      return;
    }
    var showPayment = config.mode === "cash";
    var paymentSection = showPayment
      ? '<div class="drawer-section"><h3>Payment method</h3><p class="payment-status" id="payment-status">Loading the payment methods already configured on the main website…</p><div class="payment-options" id="payment-options"></div><div id="payment-details"></div><p class="payment-confirm-note">After completing your payment, click Confirm payment below so a representative can assist with your order.</p></div>'
      : '<div class="drawer-section quote-only-note"><h3>Financing request</h3><p>Payment is not collected here. Submit your details and a representative will contact you with financing options and the next steps.</p></div>';
    var submitLabel = showPayment ? "Confirm payment" : "Request quote";
    var countryNote = config.country ? " · Country: " + config.country : "";
    node.innerHTML = '<section class="drawer-section"><h3>Selected configuration</h3>' + lines.map(function (line) {
      return '<div class="cart-line"><img src="' + esc(productImage(line.product)) + '" alt=""><div><h4>' + esc(selectedLabel()) + '</h4><p>' + (config.mode === "finance" ? money(financeTotal()) + " /mo estimated" : money(cashTotal()) + " vehicle price") + '</p><div class="quantity"><button data-quantity="' + esc(line.product.id) + '" data-delta="-1" aria-label="Decrease quantity">−</button><span>' + line.quantity + '</span><button data-quantity="' + esc(line.product.id) + '" data-delta="1" aria-label="Increase quantity">+</button><button data-remove="' + esc(line.product.id) + '">Remove</button></div></div><span class="line-price">Quote</span></div>';
     }).join("") + '<div class="total-line"><span>Pricing</span><span>Confirmed after review</span></div></section><section class="drawer-section"><h3>Delivery details</h3><form id="order-form"><div class="form-grid"><div class="field"><label for="customer-name">Full name</label><input id="customer-name" name="name" required autocomplete="name"></div><div class="field"><label for="customer-email">Email</label><input id="customer-email" name="email" type="email" required autocomplete="email"></div><div class="field"><label for="customer-phone">Phone</label><input id="customer-phone" name="phone" required autocomplete="tel"></div><div class="field"><label for="customer-location">City or delivery address</label><input id="customer-location" name="location" required placeholder="City, state or address" autocomplete="street-address"></div>' + deliveryCountryFieldMarkup() + '<div class="field full"><label for="customer-note">Configuration notes</label><textarea id="customer-note" name="note">' + esc(selectedLabel() + countryNote) + '</textarea></div></div>' + paymentSection + '<label class="consent"><input type="checkbox" name="consent" required><span>I confirm that I am an adult and understand that this is a quote/order request. Final pricing, approval and delivery are confirmed by the distributor.</span></label><button class="black-button submit-order" type="submit">' + submitLabel + '</button><p class="form-message" id="form-message" role="status"></p></form></section>';
    bindDrawerActions();
    if (showPayment) loadPaymentMethods();
  }

  function bindDrawerActions() {
    var content = document.getElementById("drawer-content");
    if (!content) return;
    content.querySelectorAll("[data-copy-payment]").forEach(function (button) {
      button.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        copyPaymentText(button.getAttribute("data-copy-payment"), button);
      });
    });
    content.querySelectorAll("[data-quantity]").forEach(function (button) {
      button.addEventListener("click", function () {
        var id = button.getAttribute("data-quantity");
        var line = cart.find(function (item) { return item.id === id; });
        if (!line) return;
        line.quantity = Math.max(1, line.quantity + Number(button.getAttribute("data-delta")));
        persistCart(); renderDrawer(); updateCartCount();
      });
    });
    content.querySelectorAll("[data-remove]").forEach(function (button) {
      button.addEventListener("click", function () {
        cart = cart.filter(function (item) { return item.id !== button.getAttribute("data-remove"); });
        persistCart(); renderDrawer(); updateCartCount();
      });
    });
    var countrySelect = content.querySelector("#delivery-country");
    if (countrySelect) {
      countrySelect.addEventListener("change", function () {
        config.country = countrySelect.value;
        var note = content.querySelector("#customer-note");
        if (note) note.value = selectedLabel() + (config.country ? " · Country: " + config.country : "");
      });
    }
    content.querySelectorAll("[data-action=close-cart]").forEach(function (button) { button.addEventListener("click", closeCart); });
    var form = content.querySelector("#order-form");
    if (form) form.addEventListener("submit", submitOrder);
  }

  function loadPaymentMethods() {
    var options = document.getElementById("payment-options");
    if (!options) return;
    function applyPaymentSettings(data) {
      /*
       * The routed endpoint returns {settings: {...}} while the direct cPanel
       * endpoint returns the settings object itself. Normalize both shapes so
       * checkout does not lose its payment details when one route is missing.
       */
      return data && data.settings && typeof data.settings === "object" ? data.settings : (data || {});
    }
    function loadFrom(url) {
      return fetch(url, { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } })
        .then(function (response) { if (!response.ok) throw new Error("payment settings unavailable"); return response.json(); });
    }
    loadFrom("../api/payment-settings")
      .catch(function () { return loadFrom("../api/payment-settings.php"); })
      .then(function (data) {
        paymentDetails = applyPaymentSettings(data);
        paymentMethods = Object.keys(paymentDetails).map(function (id) { return { id: id, label: paymentDetails[id].label || prettyLabel(id), detail: methodSummary(paymentDetails[id]) }; });
        // Keep the checkout order intentional even when the settings object
        // arrives in a different order: PayPal belongs immediately after bank.
        var paymentOrder = ["usdt", "eth", "btc", "bank", "paypal"];
        paymentMethods.sort(function (a, b) {
          var aIndex = paymentOrder.indexOf(a.id);
          var bIndex = paymentOrder.indexOf(b.id);
          if (aIndex === -1) aIndex = paymentOrder.length;
          if (bIndex === -1) bIndex = paymentOrder.length;
          return aIndex === bIndex ? 0 : aIndex - bIndex;
        });
        renderPaymentOptions();
      })
      .catch(function () {
        paymentMethods = fallbackPayments;
        var status = document.getElementById("payment-status");
        if (status) status.textContent = "The checkout is ready for the same payment categories used by the main site. Live instructions appear when available.";
        renderPaymentOptions();
      });
  }

  function prettyLabel(id) { return id.replace(/[-_]/g, " ").replace(/\b\w/g, function (char) { return char.toUpperCase(); }); }
  function methodSummary(details) {
    if (!details) return "Payment instructions confirmed by the distributor team.";
    var keys = ["network", "name", "bankName", "accountName", "handle", "account", "accountNumber", "swift"];
    return keys.map(function (key) { return details[key] ? key === "network" ? details[key] : key.replace(/([A-Z])/g, " $1") + ": " + details[key] : ""; }).filter(Boolean).slice(0, 2).join(" · ") || "Payment instructions confirmed by the distributor team.";
  }

  function renderPaymentOptions() {
    var options = document.getElementById("payment-options");
    if (!options) return;
    // A checkout rerender can trigger more than one settings response. If the
    // selected details panel was moved inside the options grid, move it back
    // out before replacing the grid so a later response cannot delete it.
    var detailNode = document.getElementById("payment-details");
    if (detailNode && detailNode.parentElement === options && options.parentNode) {
      options.parentNode.insertBefore(detailNode, options.nextSibling);
    }
    options.innerHTML = paymentMethods.map(function (method, index) { return '<label class="payment-option ' + (index === 0 ? "is-selected" : "") + '"><input type="radio" name="paymentMethod" value="' + esc(method.id) + '" ' + (index === 0 ? "checked" : "") + '><span><strong>' + esc(method.label) + '</strong><small>' + esc(method.detail) + '</small></span></label>'; }).join("");
    options.querySelectorAll("input").forEach(function (input) {
      input.addEventListener("change", function () {
        options.querySelectorAll(".payment-option").forEach(function (item) { item.classList.toggle("is-selected", item.querySelector("input").checked); });
        renderPaymentDetail(input.value);
      });
    });
    renderPaymentDetail(paymentMethods[0] && paymentMethods[0].id);
  }

  function renderPaymentDetail(methodId) {
    var node = document.getElementById("payment-details");
    if (!node) return;
    var detail = paymentDetails[methodId] || {};
    var method = paymentMethods.find(function (item) { return item.id === methodId; });
    var lines = Object.keys(detail).filter(function (key) { return key !== "label" && detail[key]; }).map(function (key) {
      var label = key.replace(/([A-Z])/g, " $1");
      var value = String(detail[key]);
      return '<div class="payment-detail-row"><span><strong>' + esc(label) + ":</strong> " + esc(value) + '</span><button type="button" class="copy-payment-button" data-copy-payment="' + esc(value) + '" aria-label="Copy payment information">Copy</button></div>';
    });
    var copyAllText = [method ? method.label : prettyLabel(methodId)].concat(
      Object.keys(detail).filter(function (key) { return key !== "label" && detail[key]; }).map(function (key) {
        return key.replace(/([A-Z])/g, " $1") + ": " + detail[key];
      })
    ).join("\n");
    // Keep the selected method's details directly beneath the selected
    // payment option so the customer sees them without scrolling past the
    // remaining methods.
    node.innerHTML = lines.length
      ? '<div class="payment-details"><strong style="display:block;margin-bottom:6px;">' + esc(method ? method.label : prettyLabel(methodId)) + ' payment details</strong>' + lines.join("") + '<button type="button" class="payment-copy-all copy-payment-button" data-copy-payment="' + esc(copyAllText) + '" aria-label="Copy all payment details">Copy all payment details</button></div>'
      : "";
    var selectedInput = document.querySelector('#payment-options input[value="' + String(methodId).replace(/"/g, '\\"') + '"]');
    var selectedOption = selectedInput && selectedInput.closest(".payment-option");
    if (selectedOption) {
      selectedOption.insertAdjacentElement("afterend", node);
    }
    node.querySelectorAll("[data-copy-payment]").forEach(function (button) {
      button.addEventListener("click", function () {
        copyPaymentText(button.getAttribute("data-copy-payment"), button);
      });
    });
  }

  function submitOrder(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var message = form.querySelector("#form-message");
    var data = new FormData(form);
    var showPayment = config.mode === "cash";
    var selectedMethod = showPayment ? data.get("paymentMethod") : null;
    var method = showPayment
      ? paymentMethods.find(function (item) { return item.id === selectedMethod; }) || fallbackPayments[0]
      : { id: "finance", label: "Financing request" };
    var payload = {
      customer: { name: data.get("name"), email: data.get("email"), phone: data.get("phone"), location: [data.get("location"), data.get("country")].filter(Boolean).join(", "), note: data.get("note"), consent: data.get("consent") === "on" },
      payment: { method: method.id, label: method.label },
      items: cartProducts().map(function (line) { return { id: line.product.id, name: selectedLabel(), quantity: line.quantity, price: config.mode === "finance" ? financeTotal() : cashTotal(), currency: "USD", mode: config.mode, drive: config.drive }; })
    };
    var submit = form.querySelector(".submit-order");
    submit.disabled = true; submit.textContent = "Sending…"; message.className = "form-message"; message.textContent = "";
    fetch("api/order.php", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload) })
      .then(function (response) { return response.json().then(function (json) { if (!response.ok) throw new Error(json.error || "The request could not be sent."); return json; }); })
      .then(function (json) {
        cart = []; persistCart();
        if (showPayment && json.orderId && json.paymentUploadToken) {
          window.location.href = "confirmation.html?type=cash&orderId=" +
            encodeURIComponent(json.orderId) + "&token=" + encodeURIComponent(json.paymentUploadToken);
          return;
        }
        window.location.href = "confirmation.html?type=finance";
      })
      .catch(function (error) { message.className = "form-message error"; message.textContent = error.message; })
      .finally(function () { submit.disabled = false; submit.textContent = showPayment ? "Confirm payment" : "Request quote"; });
  }

  fetch("catalog.json", { headers: { Accept: "application/json" } })
    .then(function (response) { if (!response.ok) throw new Error("catalog unavailable"); return response.json(); })
    .then(function (data) { catalog = Array.isArray(data.products) ? data.products : []; render(); })
    .catch(function () { app.innerHTML = '<div class="empty-state">The catalog could not be loaded. Please refresh the page or contact the distributor desk.</div>'; });
})();