const storyButtons = [...document.querySelectorAll('[data-story-target]')];
const storyPanels = [...document.querySelectorAll('[data-story-panel]')];

function showStoryAnswer(target) {
  const matchingButton = storyButtons.find((button) => button.dataset.storyTarget === target);
  const matchingPanel = storyPanels.find((panel) => panel.dataset.storyPanel === target);
  if (!matchingButton || !matchingPanel) return false;

  storyButtons.forEach((button) => {
    const selected = button === matchingButton;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  storyPanels.forEach((panel) => {
    panel.hidden = panel !== matchingPanel;
  });
  return true;
}

storyButtons.forEach((button) => {
  button.addEventListener('click', () => showStoryAnswer(button.dataset.storyTarget));
});
