document.addEventListener('DOMContentLoaded', () => {
  // Target the menu icon div, not the checkbox
  const menuIcon = document.getElementById('menu-icon');
  const menuCheckbox = document.getElementById('menu-toggle');

  menuIcon.addEventListener('click', () => {
    // Toggle the checkbox state
    menuCheckbox.checked = !menuCheckbox.checked;
  });
});
