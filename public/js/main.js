
document.addEventListener('DOMContentLoaded', () => {
  // CSRF protection for POST forms
  const tokenMeta = document.querySelector('meta[name="csrf-token"]');
  const csrfToken = tokenMeta?.getAttribute('content');

  if (csrfToken) {
    document.querySelectorAll('form').forEach(form => {
      if (form.method.toUpperCase() !== 'POST') {
        return;
      }

      if (form.querySelector('input[name="_csrf"]')) {
        return;
      }

      const tokenInput = document.createElement('input');
      tokenInput.type = 'hidden';
      tokenInput.name = '_csrf';
      tokenInput.value = csrfToken;

      form.appendChild(tokenInput);
    });
  }

  // Mobile navigation menu
  const menuToggle = document.getElementById('menuToggle');
  const nav = document.getElementById('nav');

  if (menuToggle && nav) {
    menuToggle.addEventListener('click', () => {
      const isOpen = nav.classList.toggle('open');
      menuToggle.setAttribute('aria-expanded', String(isOpen));
    });

    nav.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        nav.classList.remove('open');
        menuToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

// Confirmation dialogs
document.addEventListener('submit', event => {
  const form = event.target.closest('form[data-confirm]');
  if (!form) return;

  if (!window.confirm(form.dataset.confirm)) {
    event.preventDefault();
  }
});

// Image fallback handling
document.addEventListener('error', event => {
  const img = event.target;

  if (!(img instanceof HTMLImageElement)) return;

  const fallback = img.dataset.imageFallback;
  if (!fallback) return;

  img.classList.add('is-hidden');

  if (fallback === 'show-next' && img.nextElementSibling) {
    img.nextElementSibling.classList.remove('is-hidden');
  }
}, true);

// Login password visibility
document.addEventListener('click', event => {
  const button = event.target.closest('[data-password-toggle]');
  if (!button) return;

  const password = document.getElementById('password');
  if (!password) return;

  const visible = password.type === 'password';
  password.type = visible ? 'text' : 'password';
  button.textContent = visible ? 'HIDE' : 'SHOW';
});

// Copy poem text
document.addEventListener('click', async event => {
  const button = event.target.closest('[data-copy-poem]');
  if (!button) return;

  const poem = document.querySelector('.poem-content');
  if (!poem || !navigator.clipboard) return;

  try {
    await navigator.clipboard.writeText(poem.innerText);
    button.textContent = 'Copied!';
  } catch (error) {
    console.error('Could not copy poem:', error);
  }
});
});
