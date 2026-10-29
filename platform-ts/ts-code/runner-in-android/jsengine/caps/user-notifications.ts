/*
 Copyright (C) 2022, 2025 - 2026 3NSoft Inc.

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

import { Subject } from 'rxjs';
import { share } from 'rxjs/operators';
import { toRxObserver } from '../../../platform/lib-common/utils-for-observables';
import { Notifications as NotificationsType } from "../../../platform/caps/shell/user-notifications";
import { fnsForAndroid, wrapFnOnAndroidSide } from '../runtime-ipc-via-ports';
import { notifications_op as pb } from "../../protos/notifications-op.proto";
import { ProtoType } from '../../../platform/lib-common/protobuf-msg';
import { ShellCAPs } from '../../../platform/inject-defs/caps';
import { Logging } from '../../../platform/inject-defs/confs';

type UserNotifications = web3n.shell.notifications.UserNotifications;
type NotificationOpts = web3n.shell.notifications.NotificationOpts;
type UserNotificationEvent = web3n.shell.notifications.UserNotificationEvent;
type Observer<T> = web3n.Observer<T>;
type CmdParams = web3n.shell.commands.CmdParams;
type ReadonlyFile = web3n.files.ReadonlyFile;

class Notifications implements NotificationsType {

	private readonly appNotifications = new Set<AppNotifications>();
	private userId = '';

	constructor(
		private readonly triggerCmd: (appDomain: string, cmd: CmdParams) => Promise<void>,
		private readonly logError: Logging['logError']
	) {
		Object.seal(this);
	}

	makeFor(appDomain: string, component: string): {
		notifications: UserNotifications; close: () => void;
	} {
		const appNotifs = new AppNotifications(
			appDomain, component,
			this.unregisterAppNotifs.bind(this),
			cmd => this.triggerCmd(appDomain, cmd),
			this.logError
		);
		this.appNotifications.add(appNotifs);
		return appNotifs.wrap();
	}

	setUserId(id: string): void {
		if (this.userId.length === 0) {
			this.userId = id;
		} else {
			throw new Error(`User id has already been set`);
		}
	}

	private unregisterAppNotifs(appNotifs: AppNotifications): void {
		this.appNotifications.delete(appNotifs);
	}

	close(): void {
		for (const appNotifs of this.appNotifications.values()) {
			appNotifs.closeByCore();
		}
		this.appNotifications.clear();
	}

	notificationClicked(id: number): void {
		for (const appNotifs of this.appNotifications) {
			if (appNotifs.findAndTriggerNotification(id)) {
				return;
			}
		}
	}

	notificationDismissed(id: number): void {
		for (const appNotifs of this.appNotifications) {
			if (appNotifs.dismissNotification(id)) {
				return;
			}
		}
	}

}
Object.freeze(Notifications.prototype);
Object.freeze(Notifications);


const addNotificationFn = wrapFnOnAndroidSide('notifications_add');
interface AddNotificationsArgs { appDomain: string; title: string; body: string; silent: boolean; }
interface NotificationId { id: number; }
const notificationIdType = ProtoType.for<NotificationId>(pb.NotificationId);
const addNotificationsArgsType = ProtoType.for<AddNotificationsArgs>(pb.AddNotificationsArgs);

async function addNotificationInAndroid(
  appDomain: string, title: string, body: string, silent: boolean
): Promise<number> {
  return notificationIdType.unpack(
		await addNotificationFn(addNotificationsArgsType.pack({ appDomain, title, body, silent }))
	).id;
}

const removeNotificationFn = wrapFnOnAndroidSide('notifications_remove');

async function removeNotificationInAndroid(id: number): Promise<void> {
	await removeNotificationFn(notificationIdType.pack({ id }));
}


class AppNotifications {

	private readonly notifs = new Map<number, Pick<NotificationOpts, 'cmd'>>();
	private readonly eventSink = new Subject<UserNotificationEvent>();
	private readonly event$ = this.eventSink.asObservable().pipe(share());

	constructor(
		public readonly appDomain: string,
		public readonly component: string,
		private readonly unregisterOnClose: Notifications['unregisterAppNotifs'],
		private readonly triggerCmd: (cmd: CmdParams) => Promise<void>,
		private readonly logError: Logging['logError']
	) {
		Object.seal(this);
	}

	wrap(): { notifications: UserNotifications; close: () => void; } {
		const notifications: UserNotifications = {
			addNotification: this.addNotification.bind(this),
			removeNotification: this.removeNotification.bind(this),
			watch: this.watch.bind(this)
		};
		const close = this.closeByApp.bind(this);
		return { notifications, close };
	}

	dismissNotification(id: number): boolean {
		const notification = this.notifs.get(id);
		if (notification) {
			this.notifs.delete(id);
			this.eventSink.next({
				notificationId: id, type: 'closed'
			});
			return true;
		} else {
			return false;
		}
	}

	findAndTriggerNotification(id: number): boolean {
		const notification = this.notifs.get(id);
		if (notification) {
			this.notifs.delete(id);
			this.eventSink.next({
				notificationId: id, type: 'clicked'
			});
			if (notification.cmd) {
				this.triggerCmd(notification.cmd).catch(
					err => this.logError(err, `Notification triggered command failed`)
				);
			}
			return true;
		} else {
			return false;
		}
	}

	private async addNotification({ title, body, cmd, silent, icon }: NotificationOpts): Promise<number> {
		const notificationId = await addNotificationInAndroid(this.appDomain, title ?? '', body ?? '', !!silent);
		this.notifs.set(notificationId, { cmd });
		return notificationId;
	}

	private async removeNotification(id: number): Promise<void> {
		const notif = this.notifs.get(id); 
		if (notif) {
			this.notifs.delete(id);
			await removeNotificationInAndroid(id);
		}
	}
	

	private watch(obs: Observer<UserNotificationEvent>): () => void {
		const sub = this.event$.subscribe(toRxObserver(obs));
		return () => sub.unsubscribe();
	}

	private closeByApp(): void {
		this.closeAllNotifications();
		this.unregisterOnClose(this);
	}

	private closeAllNotifications(): void {
		for (const id of this.notifs.keys()) {
			removeNotificationInAndroid(id).catch(noop);
		}
		this.notifs.clear();
	}

	closeByCore(): void {
		this.eventSink.complete();
		this.closeAllNotifications();
	}

	private async toNativeImage(icon: NotificationOpts['icon']): Promise<Uint8Array|undefined> {
		if (!icon) {

			// XXX get app's icon, and use it. May cache app icon for some time.


			return;
		} else if ((icon as Uint8Array).BYTES_PER_ELEMENT) {
			return; // nativeImage.createFromBuffer(toBuffer(icon as Uint8Array));
		} else {
			const bytes = await (icon as ReadonlyFile).readBytes();
			if (bytes) {
				throw new Error(`File is empty`);
			}
			return; // nativeImage.createFromBuffer(toBuffer(icon as Uint8Array));
		}

	}

}
Object.freeze(AppNotifications.prototype);
Object.freeze(AppNotifications);


function noop() {}

export function notificationsMaker(logError: Logging['logError']): NonNullable<ShellCAPs['makeNotifications']> {
	let notifications: Notifications|undefined = undefined;

	async function notificationClicked({ id }: NotificationId) {
		notifications?.notificationClicked(id);
	}
	fnsForAndroid.exposeFn(
		notificationClicked,
		ProtoType.for<NotificationId>(pb.NotificationId),
		undefined
	);

	async function notificationDismissed({ id }: NotificationId) {
		notifications?.notificationDismissed(id);
	}
	fnsForAndroid.exposeFn(
		notificationDismissed,
		ProtoType.for<NotificationId>(pb.NotificationId),
		undefined
	);

	return triggerCmd => {
		notifications = new Notifications(triggerCmd, logError);
		return notifications;
	};
}


Object.freeze(exports);