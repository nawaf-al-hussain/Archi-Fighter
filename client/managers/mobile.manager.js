export const mobileManager = {

	/** 
	 * Checks if the user is on a mobile device based on the user agent and screen width.
	 * @returns {boolean} 
	*/
	isMobile() {
		const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

		if (!isMobileDevice) {
			return window.innerWidth <= 768;
		}
		return this.isMobile;
	},

	/**
	 * Display message on game-container if on mobile.
	 * @param {string} message
	 */
	displayMobileMessage(message) {
		const container = document.getElementById("game-container");
		container.innerHTML = `<div class="mobile-message">${message}</div>`;
	}
}
