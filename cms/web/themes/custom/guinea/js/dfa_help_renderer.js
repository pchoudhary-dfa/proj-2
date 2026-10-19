let dfaHelpUrl;
let dfaHelpIcon;
let lang = null;
let dfaHelpColor;
let dfaHelpEnabled;
let previousId;
let previousKeysStack = [];
let languages = { en: 'En', fr: 'Fr', es: "Es", pt: 'Pt', ar: 'Ar' };
let selectedLangButton = null;

//init function
let dfaHelp = {
  init: function (obj) {
    // console.log('in init');
    previousId = '';
    dfaHelpUrl = obj.apiURL;
    dfaHelpIcon = obj.helpIcon;
    dfaHelpColor = obj.colorCode;
    lang = obj.langCode;
    if (obj.languages) {
      languages = obj.languages;
    }
    dfaHelpEnabled = (obj.enabled != undefined && obj.enabled != null) ? obj.enabled : true; // make enable/disable DFA Help

    if (dfaHelpEnabled) {
      createIcon();
    }
  },
  refresh: function () {
    // console.log(dfaHelpUrl);
    // console.log('refresh');
    if (dfaHelpEnabled) {
      createIcon();
    }
  }
};


let openHandler = () => {
  if (document.querySelector(".dfaHelpSidebar"))
    document.querySelector(".dfaHelpSidebar").classList.remove("dfa-help-hidden");
};

let closeHandler = () => {
  let dfaHelpSidebar = document.querySelector(".dfaHelpSidebar");
  dfaHelpSidebar.classList.add("dfa-help-close-sidebar");
  dfaHelpSidebar.classList.remove("show-dfaHelpSidebar");
  setTimeout(() => {
    dfaHelpSidebar.classList.add("dfa-help-hidden");
    dfaHelpSidebar.classList.remove("dfa-help-close-sidebar");
  }, 300);
};

let backHandler = () => {
  // console.log(previousKeysStack);
  if (previousKeysStack.length > 0 ) {
    let previousKey = previousKeysStack.pop(); // Pop the previous key from the stack
    previousId = previousKey;
    console.log(previousKeysStack);
    if (previousKeysStack.length == 0) {
      makeBackBtnDisabled();
    }
    
    // console.log('back pressed'+' '+ lang)
    fetchApiData(dfaHelpUrl, previousKey);
  }
};

let elementClasses = ['dfa-help-heading-h3', 'TitleOFEditor', 'content', 'dfaHelpTitleOFEditor', 'brdTop p', 'p1', 'content ul li', 'inner-dfaHelpSidebar', 'content ul', 'content p'];

// Calculating the font size of the elements
let size = [];
let lineHeight = [];
function computeSize() {
  i = 0;
  for (let idx in elementClasses) {
    let elements = document.querySelectorAll('.' + elementClasses[idx]);

    elements.forEach(elmt => {
      var fontSize = window.getComputedStyle(elmt).fontSize;
      var lineHeightSize = window.getComputedStyle(elmt).lineHeight;
      size[i] = parseFloat(fontSize);
      lineHeight[i] = parseFloat(lineHeightSize);
      i++;
    });
  }
  // console.log(size+' comp');
}

// Font Increment Function
let fontIncHandler = () => {
  for (let idx in elementClasses) {
    let elements = document.querySelectorAll('.' + elementClasses[idx]);

    elements.forEach(elmt => {
      var fontSize = window.getComputedStyle(elmt).fontSize;
      var lineHeight = window.getComputedStyle(elmt).lineHeight;
      var currentSize = parseFloat(fontSize);
      var currentLineHeight = parseFloat(lineHeight);
      var newSize = currentSize + 1;
      var newLineHeight = currentLineHeight + 1;

      if (newSize <= 20) {
        elmt.style.fontSize = newSize + 'px';
        elmt.style.lineHeight = newLineHeight + 'px';
      }
    });
  }
}


// Font Decrement Function
let fontDecHandler = () => {
  i = 0;
  for (let idx in elementClasses) {
    let elements = document.querySelectorAll('.' + elementClasses[idx]);
    // console.log(elements +' elements');

    elements.forEach(elmt => {
      var fontSize = window.getComputedStyle(elmt).fontSize;
      var lineHeight = window.getComputedStyle(elmt).lineHeight;
      var currentSize = parseFloat(fontSize);
      var currentLineHeight = parseFloat(lineHeight);
      // console.log(elmt +' elmt');
      // console.log(currentSize +' cursize');
      var newSize = currentSize - 1;
      var newLineHeight = currentLineHeight - 1;

      // console.log(newSize + " " + size[i]);
      if (newSize > size[i]) {
        elmt.style.fontSize = newSize + 'px';
        elmt.style.lineHeight = newLineHeight + 'px';
      }
      i++;
    });
  }
}



function createIcon() {
  // Creating the buttons for each div having attribute dfa-help
  var dfaHelpDivs = document.querySelectorAll("[dfa-help]");
  dfaHelpDivs.forEach(function (dfaHelpDiv) {
    var openSidebar = document.createElement("pre");
    // Create icon if icon is not there
    if (dfaHelpDiv.innerHTML.length == 0) {
      openSidebar.innerHTML = dfaHelpIcon; // Set the dfaHelpIcon as HTML content
      openSidebar.setAttribute("class", "dfaHelp-MyButton");
      openSidebar.style.color = dfaHelpColor;

      // Adding the event listener
      openSidebar.addEventListener("click", openHandler);
      openSidebar.addEventListener("click", function () {
        var id = dfaHelpDiv.getAttribute("dfa-help");
        if (id != previousId) {
          previousKeysStack = [];
          previousId = id;

          // console.log('in create icon ' + lang);
          // console.log('in create icon ' + previousKeysStack);
          fetchApiData(dfaHelpUrl, id);
          // console.log(previousId + 'in event');
        }
      });

      dfaHelpDiv.appendChild(openSidebar);
    }
  });
}


function fillInitialData() {
  var existingRightDiv = document.getElementsByClassName("dfaHelpSidebar");
  if (existingRightDiv.length > 0) {
    innerSidebar = existingRightDiv[0].querySelector(".inner-dfaHelpSidebar");
    myBox = existingRightDiv[0].querySelector("#dfaHelp-myBox");
    innerSidebar.innerHTML = '<i class="fa fa-spinner" style="font-size:24px;"></i>';
  }
}

var response;

fetchApiData = async (apiUrl, id) => {
  fillInitialData();

  let options = {
    method: "GET",
    headers: {
      "Content-type": "application/json",
    },
  };

  // console.log(apiUrl + " " + JSON.stringify(options) + " " + id);
  apiUrl = `${apiUrl}/${id}`;

  let apiCall = await fetch(apiUrl, options);

  response = await apiCall.json();
  // console.log(response);
  renderer(response);
  // computeSize();
};

var myBox;
var innerSidebar;
var existingRightDiv;

function renderer(data) {
  // console.log('in renderer ' + previousKeysStack);
  // console.log(previousKeysStack);
  var existingRightDiv = document.getElementsByClassName("dfaHelpSidebar");

  if (existingRightDiv.length > 0) {
    innerSidebar = existingRightDiv[0].querySelector(".inner-dfaHelpSidebar");
    myBox = existingRightDiv[0].querySelector("#dfaHelp-myBox");
  } else {
    /// ----------- Slider Panel
    var rightDiv = document.createElement("div");
    rightDiv.classList.add("dfaHelpSidebar");
    setTimeout(function () {
      rightDiv.classList.add("show-dfaHelpSidebar");
    }, 300);

    /// ------------- Close Button
    var closeButton = document.createElement("button");
    closeButton.classList.add("dfaHelp-close-button");
    //closeButton.innerHTML = "X";
    closeButton.innerHTML = `<i class="fa fa-close" style="font-size:17px"></i>`;
    closeButton.addEventListener("click", closeHandler);
    closeButton.style.backgroundColor = dfaHelpColor;

    /// ------------ Font Size Increase button
    var fontIncButton = document.createElement("button");
    fontIncButton.classList.add("dfaHelp-fontinc-button");
    fontIncButton.innerHTML = "A+";
    fontIncButton.addEventListener("click", fontIncHandler);
    // fontIncButton.style.backgroundColor = dfaHelpColor;
    fontIncButton.style.backgroundColor = '#fff';

    /// ------------ Font Size Decrease button
    var fontDecButton = document.createElement("button");
    fontDecButton.classList.add("dfaHelp-fontdec-button");
    fontDecButton.innerHTML = "A-";
    fontDecButton.addEventListener("click", fontDecHandler);
    // fontDecButton.style.backgroundColor = dfaHelpColor;
    fontDecButton.style.backgroundColor = '#fff';


    /// ------------ Inner Content
    var innerSidebar = document.createElement("div");
    innerSidebar.setAttribute("class", "inner-dfaHelpSidebar");

    /// ------------ Related topics
    myBox = document.createElement("div");
    myBox.setAttribute("id", "dfaHelp-myBox");

    /// ------------ Back button
    let backButton = document.createElement("button");
    backButton.innerHTML = `<i class="fa fa-arrow-left" style="font-size:17px"></i>`;
    backButton.classList.add("dfaHelp-back-button", "disableButton");
    backButton.setAttribute('id', 'dfaHelp-back-button')
    backButton.style.background = dfaHelpColor;
    backButton.style.display = (previousKeysStack.length > 0) ? "inline-flex" : "none";
    backButton.addEventListener("click", backHandler);
    backButton.setAttribute('disabled', '');
    // if(previousKeysStack.length > 0) {
    //   // debugger;
    //   backButton.removeAttribute('disabled');
    // }

    rightDiv.appendChild(backButton);

    //font div
    var fontDiv = document.createElement("div");
    fontDiv.setAttribute("class", "inner-dfaHelpFontHead");

    fontDiv.appendChild(fontIncButton);
    fontDiv.appendChild(fontDecButton);

    /// ------------ Language buttons
    var langDiv = document.createElement("div");
    langDiv.setAttribute("class", "inner-dfaHelpLangHead");

    // var left = 148;
    var left = 0;
    let i = 0;
    for (let idx in languages) {
      var langButton = document.createElement("button");
      langButton.setAttribute('id', 'dfaHelp_langbtn_' + idx);
      langButton.classList.add("dfaHelp-lang-button");
      langButton.innerHTML = languages[idx];
      // changing the button color as per lang
      if (idx == lang) {
        langButton.style.backgroundColor = dfaHelpColor;
        langButton.style.color = 'white';
        selectedLangButton = langButton;
      } else {
        langButton.style.backgroundColor = '#ffffff';
      }
      // langButton.style.left = left + (i * 40) + 'px';
      langButton.style.left = left + (i) + 'px';
      i++;
      // adding event listner for langButton
      langButton.addEventListener("click", function (Event) {
        var langButtonText = Event.target.textContent;
        var language = Object.keys(languages).find(key => languages[key] === langButtonText);
        var btn = document.getElementById('dfaHelp_langbtn_' + language);
        selectedLangButton.style.backgroundColor = "#ffffff";
        selectedLangButton.style.color = "black";
        btn.style.backgroundColor = dfaHelpColor;
        btn.style.color = '#fff';
        selectedLangButton = btn;
        // console.log(response);
        lang = language;
        // console.log('lang btn pressed ' + lang)
        showingData(myBox, innerSidebar, response, lang);
      });

      langDiv.appendChild(langButton);
    }
    rightDiv.appendChild(fontDiv);
    rightDiv.appendChild(langDiv);
    rightDiv.appendChild(closeButton);
    rightDiv.appendChild(innerSidebar);
    rightDiv.appendChild(myBox);

    document.body.appendChild(rightDiv);
    document.documentElement.style.setProperty('--scrollbar-background-color', dfaHelpColor);
    document.documentElement.style.setProperty('--scrollbar-color', dfaHelpColor);
  }

  showingData(myBox, innerSidebar, data, lang);
}

function showingData(myBox, innerSidebar, data, lang) {
  myBox.innerHTML = "";
  // console.log(data);
  // console.log(lang);
  if (previousKeysStack.length == 0) {
    makeBackBtnDisabled();
  }

  // Add RTL support to innerSidebar if language is "ar"
  if (lang === "ar") {
    innerSidebar.parentElement.classList.add("dfaHelpSidebarRtl");
  } else {
    innerSidebar.parentElement.classList.remove("dfaHelpSidebarRtl");
  }

  // Show/Hide back button if there is a previous key in the stack
  var backBtnElem = document.getElementsByClassName("dfaHelp-back-button");
  if (backBtnElem.length > 0 && backBtnElem[0]) {
    // debugger;
    backBtnElem[0].style.display = (previousKeysStack.length > 0) ? "inline-flex" : "none";
  }

  if (!data.success && data.message === "Data Not Found") {
    let dataNotFoundMessage = "";
    innerSidebar.style.height = 'calc(100vh - 68px)';
    innerSidebar.style.margin = '15px 0 0 0';

    if (lang === "ar") {
      dataNotFoundMessage = "لم يتم العثور على البيانات!";
    } else if (lang === "fr") {
      // console.log('here');
      dataNotFoundMessage = "Données non trouvées !";
    } else if (lang === "es") {
      dataNotFoundMessage = "¡Datos no encontrados!";
    } else if (lang === "pt") {
      dataNotFoundMessage = "Dados não encontrados!";
    } else {
      dataNotFoundMessage = "Data Not Found!";
    }

    innerSidebar.innerHTML = dataNotFoundMessage;
    myBox.style.display = "none";
    return false;
  }

  //add content
  let translations = data.data.translations;
  
  let hasRelatedKeys = data.data.related_keys.length > 0;
  let relTranslationsFound;

  if(hasRelatedKeys) {
    let relKeys = data.data.related_keys;
    // console.log(relKeys);
    for(let i=0; i<relKeys.length; i++) {
      // console.log(relKeys[i].translations);
      relTranslationsFound = relKeys[i].translations.some((translation) => translation.locale === lang);
      if(relTranslationsFound) {
        break;
      }
    }
  }

  // console.log(relTranslationsFound);

  let translationsFound = translations.some((translation) => translation.locale === lang);
  if (!translationsFound) {
    let dataNotFoundMessage = "";

    if (lang === "ar") {
      dataNotFoundMessage = "لم يتم العثور على البيانات!";
    } else if (lang === "fr") {
      dataNotFoundMessage = "Données non trouvées !";
    } else if (lang === "es") {
      dataNotFoundMessage = "¡Datos no encontrados!";
    } else if (lang === "pt") {
      dataNotFoundMessage = "Dados não encontrados!";
    } else {
      dataNotFoundMessage = "Data Not Found!";
    }

    innerSidebar.innerHTML = dataNotFoundMessage;
    if(!relTranslationsFound) {
      innerSidebar.style.textAlign = 'center';
      myBox.style.display = "none";
      innerSidebar.style.height = 'calc(100vh - 68px)';
      innerSidebar.style.margin = '15px 0 0 0';
      return false;
    }
  }

  // translation found or related keys found

  for (let i = 0; i < translations.length; i++) {
    if (translations[i].locale == lang) {

      // console.log(translations[i].title.length);
      innerSidebar.innerHTML = `<h3 id="dfa-help-heading-h3" class="dfa-help-heading-h3" title="${translations[i].title}">${translations[i].title}</h3>`;

      innerSidebar.innerHTML += `<div class="content">${translations[i].desc ?? ""}</div>`;

      if (translations[i].purpose != "") {
        innerSidebar.innerHTML += `<div class="content brdTop">${translations[i].purpose ?? ""}</div>`;
      }
      innerSidebar.style.height = 'calc(100vh - 182px)';
      innerSidebar.style.margin = '66px 0 0 0';
      innerSidebar.style.textAlign = 'left';

      var heading_h3 = document.getElementById('dfa-help-heading-h3');
      heading_h3.style.height = '40px';
      heading_h3.style.padding = '18px 0 0 0';

      if (translations[i].title.length > 39) {
        heading_h3.style.height = '47px';
        heading_h3.style.padding = '7px 0 0 0';
      }
    }
    if ((translations[i].desc ?? "") == "" && (translations[i].purpose ?? "") == "") {
      innerSidebar.innerHTML += 'No data found!';
    }
  }

  let relatedKeys = data.data.related_keys;
  let countRelKeys = 0;
  // console.log(hasRelatedKeys);
  if(relTranslationsFound) {
    myBox.style.display = "block"; // Show myBox if there are related keys
    if(translationsFound) {
      innerSidebar.style.height = 'calc(100vh - 182px)';
    } else {
      innerSidebar.style.height = 'calc(100vh - 122px)';
      innerSidebar.style.margin = '15px 0 0 0';
      innerSidebar.style.textAlign = 'center';
    }

    for (let i = 0; i < relatedKeys.length; i++) {
      let reltrans = relatedKeys[i].translations;
      let relkey = relatedKeys[i].key;
      for (let i = 0; i < reltrans.length; i++) {
        if (reltrans[i].locale == lang) {
          let relatedLink = document.createElement("a");
          relatedLink.textContent = reltrans[i].title;
          relatedLink.href = "#";
          relatedLink.style.background = dfaHelpColor;
          relatedLink.addEventListener("click", (event) => {
            event.preventDefault();
            if (relkey != previousId) {
              /// ----------- Insert key in array stack if does nto exit
              if (!previousKeysStack.includes(previousId)) {
                previousKeysStack.push(previousId); // Push the previous key onto the stack
                var backBtn = document.getElementById("dfaHelp-back-button");
                backBtn.removeAttribute('disabled');
                backBtn.classList.remove("disableButton");

              }
              previousId = relkey;

              fetchApiData(dfaHelpUrl, relkey);
            }
          });
          let relatedParagraph = document.createElement("p");
          relatedParagraph.appendChild(relatedLink);
          myBox.appendChild(relatedParagraph);
          countRelKeys++;
        }
      }
    }
  }
  if (countRelKeys == 0) {
    myBox.style.display = "none"; // Hide myBox if there are no related keys
    innerSidebar.style.height = 'calc(100vh - 122px)';
  }
  computeSize();
}

function makeBackBtnDisabled() {
  var backBtn = document.getElementById("dfaHelp-back-button");
  backBtn.setAttribute('disabled', '');
  backBtn.classList.add("disableButton");
}
