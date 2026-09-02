/*
 Copyright (C) 2022, 2025 3NSoft Inc.

 This program is free software: you can redistribute it and/or modify it under
 the terms of the GNU General Public License as published by the Free Software
 Foundation, either version 3 of the License, or (at your option) any later
 version.

 This program is distributed in the hope that it will be useful, but
 WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 See the GNU General Public License for more details.

 You should have received a copy of the GNU General Public License along with
 this program. If not, see <http://www.gnu.org/licenses/>.
*/


declare namespace web3n.shell.notifications {

	interface UserNotifications {
		addNotification(opts: NotificationOpts): Promise<number>;
		removeNotification(id: number): Promise<void>;
		watch(obs: Observer<UserNotificationEvent>): () => void;
	}

	interface NotificationOpts {
		title?: string;
		body?: string;
		cmd?: commands.CmdParams;
		silent?: boolean;
		icon?: Uint8Array|web3n.files.ReadonlyFile;
	}

	type UserNotificationEvent = NotificationClicked |
		NotificationClosed | NotificationShown;

	interface NotificationEvent {
		notificationId: number;
	}

	interface NotificationClicked extends NotificationEvent {
		type: 'clicked';
	}

	interface NotificationClosed extends NotificationEvent {
		type: 'closed';
	}

	interface NotificationShown extends NotificationEvent {
		type: 'shown';
	}

}
