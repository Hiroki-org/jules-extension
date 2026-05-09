const fs = require('fs');
let code = fs.readFileSync('src/composer.ts', 'utf8');

// For 3212203815: prefers-reduced-motion
const cssToReplace = `  @keyframes spin {
    to { transform: rotate(360deg); }
  }`;
const cssReplacement = `  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @media (prefers-reduced-motion: reduce) {
    .spinner {
      animation: none;
    }
  }`;
code = code.replace(cssToReplace, cssReplacement);

// For 3212203468 and 3212204083: update aria-label and title during sending
const jsToReplace = `      submitButton.disabled = true;
      submitButton.innerHTML = 'Sending... <span class="spinner"></span>';
      submitButton.setAttribute('aria-busy', 'true');`;

const jsReplacement = `      submitButton.disabled = true;
      submitButton.innerHTML = 'Sending... <span class="spinner"></span>';
      submitButton.setAttribute('aria-busy', 'true');
      submitButton.title = 'Sending message...';
      submitButton.setAttribute('aria-label', 'Sending message...');`;

code = code.replace(jsToReplace, jsReplacement);

fs.writeFileSync('src/composer.ts', code);
