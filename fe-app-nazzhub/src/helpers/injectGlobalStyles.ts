import { GlobalStyles } from '../styles';

const NAZZHUB_GLOBAL_STYLES_ID = 'nazzhub-global-styles';

export function injectGlobalStyles() {
  if (document.getElementById(NAZZHUB_GLOBAL_STYLES_ID)) {
    return;
  }

  document.head.insertAdjacentHTML(
    'beforeend',
    `
        <style id="${NAZZHUB_GLOBAL_STYLES_ID}">
          ${GlobalStyles}
        </style>
    `,
  );
}
