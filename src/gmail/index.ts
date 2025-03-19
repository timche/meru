import path from "node:path";
import { config } from "@/lib/config";
import type { Account } from "@/lib/config/types";
import {
	APP_SIDEBAR_WIDTH,
	APP_TOOLBAR_HEIGHT,
	GMAIL_URL,
} from "@/lib/constants";
import { openExternalUrl } from "@/lib/url";
import type { Main } from "@/main";
import { WebContentsView } from "electron";
import type { RendererEvent } from "./preload/ipc";
import gmailStyles from "./styles.css" with { type: "text" };

export type GmailNavigationHistory = {
	canGoBack: boolean;
	canGoForward: boolean;
};

export type GmailNavigationHistoryChangedListener = (
	navigationHistory: GmailNavigationHistory,
) => void;

export type GmailVisibleChangedListener = (visible: boolean) => void;

export class Gmail {
	main: Main;

	views = new Map<string, WebContentsView>();
	visible = true;

	private listeners = {
		navigationHistoryChanged: new Set<GmailNavigationHistoryChangedListener>(),
		visibleChanged: new Set<GmailVisibleChangedListener>(),
	};

	constructor({ main }: { main: Main }) {
		this.main = main;

		const accounts = config.get("accounts");

		for (const account of accounts) {
			this.createView(account);
		}

		this.main.window.on("resize", () => {
			const { width, height } = this.main.window.getBounds();

			const accounts = config.get("accounts");

			for (const view of this.views.values()) {
				this.setViewBounds({
					view,
					width,
					height,
					sidebarInset: accounts.length > 1,
				});
			}
		});

		main.window.on("focus", () => {
			const selectedAccount = this.getSelectedAccount();

			const view = this.getView(selectedAccount);

			view.webContents.focus();
		});
	}

	createView(account: Account) {
		const view = new WebContentsView({
			webPreferences: {
				partition: this.getPartition(account),
				preload: path.join(
					...(process.env.NODE_ENV === "production"
						? [__dirname]
						: [process.cwd(), "out"]),
					"gmail",
					"preload",
					"index.js",
				),
			},
		});

		this.main.window.contentView.addChildView(view);

		const accounts = config.get("accounts");

		const { width, height } = this.main.window.getBounds();

		this.setViewBounds({
			view,
			width,
			height,
			sidebarInset: accounts.length > 1,
		});

		view.setVisible(this.visible && account.selected);

		view.webContents.loadURL(GMAIL_URL);
		view.webContents.openDevTools({ mode: "detach" });
		view.webContents.setWindowOpenHandler(({ url }) => {
			openExternalUrl(url);

			return {
				action: "deny",
			};
		});

		view.webContents.on("dom-ready", () => {
			if (view.webContents.getURL().startsWith(GMAIL_URL)) {
				view.webContents.insertCSS(gmailStyles);
			}
		});

		if (account.selected) {
			this.setViewListeners(view);
		}

		this.views.set(account.id, view);
	}

	getPartition(account: Account) {
		return `persist:${account.id}`;
	}

	setViewBounds({
		view,
		width,
		height,
		sidebarInset,
	}: {
		view: WebContentsView;
		width: number;
		height: number;
		sidebarInset: boolean;
	}) {
		view.setBounds({
			x: sidebarInset ? APP_SIDEBAR_WIDTH : 0,
			y: APP_TOOLBAR_HEIGHT,
			width: sidebarInset ? width - APP_SIDEBAR_WIDTH : width,
			height: height - APP_TOOLBAR_HEIGHT,
		});
	}

	setAllViewBounds({
		width,
		height,
		sidebarInset,
	}: { width: number; height: number; sidebarInset: boolean }) {
		for (const view of this.views.values()) {
			this.setViewBounds({
				view,
				width,
				height,
				sidebarInset,
			});

			if (!this.visible) {
				view.setVisible(false);
			}
		}
	}

	onVisibleChanged(listener: GmailVisibleChangedListener) {
		this.listeners.visibleChanged.add(listener);

		return () => {
			this.listeners.visibleChanged.delete(listener);
		};
	}

	notifyVisibleChangedListeners(visible: boolean) {
		for (const listener of this.listeners.visibleChanged) {
			listener(visible);
		}
	}

	onNavigationHistoryChanged(listener: GmailNavigationHistoryChangedListener) {
		this.listeners.navigationHistoryChanged.add(listener);

		return () => {
			this.listeners.navigationHistoryChanged.delete(listener);
		};
	}

	notifyNavigationHistoryChangedListeners(
		navigationHistory: GmailNavigationHistory,
	) {
		for (const listener of this.listeners.navigationHistoryChanged) {
			listener(navigationHistory);
		}
	}

	setViewListeners(view: WebContentsView) {
		view.webContents.on("page-title-updated", (_event, title) => {
			this.main.setTitle(title);
		});

		const didNavigateListener = () => {
			this.notifyNavigationHistoryChangedListeners({
				canGoBack: view.webContents.navigationHistory.canGoBack(),
				canGoForward: view.webContents.navigationHistory.canGoForward(),
			});
		};

		view.webContents.on("did-navigate", didNavigateListener);

		view.webContents.on("did-navigate-in-page", didNavigateListener);
	}

	removeViewListeners(view: WebContentsView) {
		view.removeAllListeners();
	}

	setVisible(visible: boolean) {
		this.visible = visible;

		this.notifyVisibleChangedListeners(visible);
	}

	toggleVisible() {
		if (this.visible) {
			this.hide();
		} else {
			this.show();
		}

		return this.visible;
	}

	hide() {
		for (const view of this.views.values()) {
			view.setVisible(false);
		}

		this.setVisible(false);
	}

	show() {
		const selectedAccount = this.getSelectedAccount();

		if (selectedAccount) {
			for (const [accountId, view] of this.views) {
				if (accountId === selectedAccount.id) {
					view.setVisible(true);

					this.setVisible(true);
				}
			}
		}
	}

	removeView(accountId: Account["id"]) {
		const view = this.views.get(accountId);

		if (!view) {
			throw new Error("View not found");
		}

		view.webContents.close();
		view.webContents.removeAllListeners();
		this.main.window.contentView.removeChildView(view);
		this.views.delete(accountId);
	}

	selectView(account: Account) {
		for (const [accountId, view] of this.views) {
			view.setVisible(accountId === account.id);

			if (accountId === account.id) {
				this.setViewListeners(view);

				this.notifyNavigationHistoryChangedListeners({
					canGoBack: view.webContents.navigationHistory.canGoBack(),
					canGoForward: view.webContents.navigationHistory.canGoForward(),
				});

				this.main.setTitle(view.webContents.getTitle());
			} else {
				this.removeViewListeners(view);
			}
		}
	}

	getView(account: Pick<Account, "id">) {
		const view = this.views.get(account.id);

		if (!view) {
			throw new Error("Could not find view");
		}

		return view;
	}

	getSelectedAccountView() {
		return this.getView(this.getSelectedAccount());
	}

	getNavigationHistory() {
		const view = this.getSelectedAccountView();

		return {
			canGoBack: view.webContents.navigationHistory.canGoBack(),
			canGoForward: view.webContents.navigationHistory.canGoForward(),
		};
	}

	go(action: "back" | "forward") {
		switch (action) {
			case "back": {
				this.getSelectedAccountView().webContents.navigationHistory.goBack();
				break;
			}
			case "forward": {
				this.getSelectedAccountView().webContents.navigationHistory.goForward();
				break;
			}
		}
	}

	reload() {
		this.getSelectedAccountView().webContents.reload();
	}

	sendToRenderer(event: RendererEvent) {
		const view = this.getView(this.getSelectedAccount());

		view.webContents.send("ipc", event);
	}

	getSelectedAccount() {
		const account = config.get("accounts").find((account) => account.selected);

		if (!account) {
			throw new Error("Could not find selected account");
		}

		return account;
	}

	selectPreviousAccount() {
		const accounts = config.get("accounts");

		const selectedAccountIndex = accounts.findIndex(
			(account) => account.selected,
		);

		const previousAccount = accounts.at(
			selectedAccountIndex === 0 ? -1 : selectedAccountIndex + 1,
		);

		if (!previousAccount) {
			throw new Error("Could not find previous account");
		}

		config.set(
			"accounts",
			accounts.map((account) => ({
				...account,
				selected: account.id === previousAccount.id,
			})),
		);

		this.selectView(previousAccount);

		return previousAccount;
	}

	selectNextAccount() {
		const accounts = config.get("accounts");

		const selectedAccountIndex = accounts.findIndex(
			(account) => account.selected,
		);

		const nextAccount = accounts.at(
			selectedAccountIndex === accounts.length - 1
				? 0
				: selectedAccountIndex - 1,
		);

		if (!nextAccount) {
			throw new Error("Could not find next account");
		}

		config.set(
			"accounts",
			accounts.map((account) => ({
				...account,
				selected: account.id === nextAccount.id,
			})),
		);

		this.selectView(nextAccount);

		return nextAccount;
	}
}
