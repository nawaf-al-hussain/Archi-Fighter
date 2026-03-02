export const modalManager = {

  showModal(modalId) {
	const modal = document.getElementById(modalId);
	if (modal) {
	  modal.classList.remove("hidden");
	}
  },

  closeModal(modalId) {
	const modal = document.getElementById(modalId);
	if (modal) {
	  modal.classList.add("hidden");
	}
  }

};
