import { config, library } from "@fortawesome/fontawesome-svg-core";
import "@fortawesome/fontawesome-svg-core/styles.css";
import { faRightToBracket, faSliders } from "@fortawesome/free-solid-svg-icons";

// Prevent Font Awesome from dynamically adding its CSS since we import it above.
config.autoAddCss = false;

// Add the specific icons we use by string name, e.g. "fa-solid fa-sliders"
library.add(faSliders, faRightToBracket);

