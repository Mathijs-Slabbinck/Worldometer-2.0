/**
 * Reusable modal component.
 *
 * Usage:
 *   import { openModal, closeModal } from '../utils/modal.js';
 *   openModal({
 *     title: 'Astronaut Details',
 *     body: '<p>Info here</p>',        // HTML string or DOM node
 *     image: { src: '...', alt: '...' }, // optional
 *     footer: '<button>Close</button>',  // optional HTML string or DOM node
 *   });
 */

let divOverlay = null;
let divModal = null;
let previouslyFocused = null;

function buildOverlay() {
  if (divOverlay) {
    return;
  }

  divOverlay = document.createElement('div');
  divOverlay.className = 'modal-overlay';

  divModal = document.createElement('div');
  divModal.className = 'modal-container';
  divModal.setAttribute('role', 'dialog');
  divModal.setAttribute('aria-modal', 'true');
  divModal.setAttribute('tabindex', '-1');

  divModal.setAttribute('aria-labelledby', 'modal-title-id');

  const btnClose = document.createElement('button');
  btnClose.className = 'modal-close';
  btnClose.setAttribute('aria-label', 'Close modal');
  btnClose.textContent = '\u00D7';

  const divImageWrap = document.createElement('div');
  divImageWrap.className = 'modal-image-wrapper';

  const hdgTitle = document.createElement('h2');
  hdgTitle.className = 'modal-title';
  hdgTitle.id = 'modal-title-id';

  const divBody = document.createElement('div');
  divBody.className = 'modal-body';

  const divFooter = document.createElement('div');
  divFooter.className = 'modal-footer';

  divModal.appendChild(btnClose);
  divModal.appendChild(divImageWrap);
  divModal.appendChild(hdgTitle);
  divModal.appendChild(divBody);
  divModal.appendChild(divFooter);

  divOverlay.appendChild(divModal);
  document.body.appendChild(divOverlay);

  // Close on backdrop click
  divOverlay.addEventListener('click', function (e) {
    if (e.target === divOverlay) {
      closeModal();
    }
  });

  // Close button
  btnClose.addEventListener('click', closeModal);
}

function setContent(container, content) {
  container.replaceChildren();
  if (!content) {
    container.style.display = 'none';
    return;
  }
  container.style.display = '';
  if (typeof content === 'string') {
    // Only use textContent for plain text — callers should pass DOM nodes for rich content
    container.textContent = content;
  } else if (content instanceof Node) {
    container.appendChild(content);
  }
}

function handleKeydown(e) {
  if (e.key === 'Escape') {
    closeModal();
    return;
  }

  // Focus trap
  if (e.key === 'Tab' && divModal) {
    const focusable = divModal.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) {
      e.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }
}

/**
 * Open the modal with the given config.
 * @param {Object} config
 * @param {string} config.title - Modal title text
 * @param {string|Node} config.body - Body content (HTML string or DOM node)
 * @param {Object} [config.image] - Optional image { src, alt }
 * @param {string|Node} [config.footer] - Optional footer content
 */
export function openModal(config) {
  buildOverlay();

  // Title
  const hdgTitle = divModal.querySelector('.modal-title');
  hdgTitle.textContent = config.title || '';
  hdgTitle.style.display = config.title ? '' : 'none';

  // Image
  const divImage = divModal.querySelector('.modal-image-wrapper');
  divImage.replaceChildren();
  if (config.image && config.image.src) {
    const img = document.createElement('img');
    img.className = 'modal-image';
    img.src = config.image.src;
    img.alt = config.image.alt || '';
    divImage.appendChild(img);
    divImage.style.display = '';
  } else {
    divImage.style.display = 'none';
  }

  // Body
  setContent(divModal.querySelector('.modal-body'), config.body);

  // Footer
  setContent(divModal.querySelector('.modal-footer'), config.footer);

  // Lock scroll
  document.body.style.overflow = 'hidden';

  // Show
  divOverlay.classList.add('active');

  // Focus management
  previouslyFocused = document.activeElement;
  divModal.focus();

  // Keyboard listener
  document.addEventListener('keydown', handleKeydown);
}

/**
 * Close the currently open modal.
 */
export function closeModal() {
  if (!divOverlay) {
    return;
  }

  divOverlay.classList.remove('active');
  document.body.style.overflow = '';
  document.removeEventListener('keydown', handleKeydown);

  // Restore focus
  if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
    previouslyFocused.focus();
  }
  previouslyFocused = null;
}
