import { initRouter } from './src/router.js';
import { renderNavbar } from './src/components/navbar.js';
import { READ_ONLY_MODE } from './src/config.js';
import { initializeStoreData } from './src/store.js';
import { initPushNotifications } from './src/utils/pushNotifications.js';
import './src/components/toast.js'; // Register global notification listener

function notifyDataReady() {
	window.dispatchEvent(new Event('storyverse:data-ready'));
}

function initializeStoreDataInBackground() {
	let didNotify = false;
	const safeNotify = () => {
		if (didNotify) return;
		didNotify = true;
		notifyDataReady();
	};

	// Do not block first render on network/storage edge cases.
	initializeStoreData()
		.catch((error) => {
			console.error('Store initialization failed:', error);
		})
		.finally(safeNotify);

	// Some browsers/networks may hang initial fetch; continue rendering regardless.
	setTimeout(safeNotify, 3000);
}

function bootstrap() {
	try {
		// Render app shell immediately so users don't see a blank page.
		renderNavbar();
		initRouter();

		// Background initialization tasks.
		initializeStoreDataInBackground();
		if (!READ_ONLY_MODE) {
			initPushNotifications();
		}
	} catch (error) {
		console.error('Bootstrap failed:', error);
		const main = document.getElementById('main-content');
		if (main) {
			main.innerHTML = `
			  <div class="empty-state">
				<div class="empty-state-icon">⚠️</div>
				<h3>App failed to start</h3>
				<p>Please refresh this page once.</p>
			  </div>
			`;
		}
	}
}

bootstrap();
