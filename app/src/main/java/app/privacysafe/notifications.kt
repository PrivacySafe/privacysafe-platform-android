/*
 Copyright (C) 2026 3NSoft Inc.

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
package app.privacysafe

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context.NOTIFICATION_SERVICE
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.core.app.NotificationCompat
import androidx.core.graphics.drawable.IconCompat


private const val CORE_RUNNER_NOTIFICATIONS_CHANNEL_ID = "core-runner"

class Notifications(
	private val ctx: CoreRunnerService
) {

	private val appChannels = mutableMapOf<String, AppNotifications>()

	private val notifications = ctx.getSystemService(NOTIFICATION_SERVICE) as NotificationManager
	private val nextNotificationId = makeSequentialIntegerIdGenerator()
	private val mainNotificationId = nextNotificationId()

	init {
		registerCoreRunnerNotificationChannel()
	}

	private fun registerCoreRunnerNotificationChannel() {
		registerNotificationChannel(
			CORE_RUNNER_NOTIFICATIONS_CHANNEL_ID,
			ctx.getString(R.string.core_runner_channel),
			ctx.getString(R.string.core_runner_channel_description),
			NotificationManager.IMPORTANCE_LOW
		)
	}

	private fun registerNotificationChannel(
		channelId: String, channelName: String, channelDescription: String, channelImportance: Int
	) {
		if (notifications.getNotificationChannel(channelId) != null) {
			return
		}
		val channel = NotificationChannel(channelId, channelName, channelImportance)
		channel.description = channelDescription
		channel.setShowBadge(false)
		notifications.createNotificationChannel(channel)
	}

	fun makeMainNotification(loggedUserId: String?): Pair<Int, Notification> {
		return Pair(
			mainNotificationId,
			NotificationCompat.Builder(ctx, CORE_RUNNER_NOTIFICATIONS_CHANNEL_ID)
				.setSmallIcon(R.drawable.app_logo)
				.setContentTitle(ctx.resources.getString(R.string.app_name))
				.setPriority(NotificationCompat.PRIORITY_LOW)
				.setContentText(loggedUserId ?: ctx.getString(R.string.tap_to_login_notification_txt))
				// can start launcher app only from app activity, so, startup talks to service that focuses/opens launcher
				.setContentIntent(ctx.intentToOpenStartUpFromNotification())
				.build()
		)
	}

	fun publishMainNotification(loggedUserId: String?) {
		val mainNotification = makeMainNotification(loggedUserId)
		notifications.notify(mainNotification.first, mainNotification.second)
	}

	fun removeAll() {
		for (channel in appChannels.values) {
			if (channel.notifIds.isNotEmpty()) {
				for (notificationId in channel.notifIds) {
					notifications.cancel(notificationId)
				}
				channel.notifIds.clear()
			}
		}
		notifications.cancel(mainNotificationId)
	}

	fun removeAppNotification(notificationId: Int) {
		val channel = appChannels.values.find() { channel -> channel.notifIds.contains(notificationId) }
		if (channel != null) {
			notifications.cancel(notificationId)
			channel.notifIds.remove(notificationId)
		}
	}

	private fun getOrMakeAppNotificationsChannel(appDomain: String): AppNotifications {
		var channel = appChannels[appDomain]
		if (channel == null) {
			val appIcon = BitmapFactory.decodeResource(ctx.resources, R.drawable.chat_app_logo)
			channel = AppNotifications(appDomain, appIcon)
			registerNotificationChannel(
				channel.appDomain,
				channel.channelName,
				"Notifications from ${channel.channelName}",
				NotificationManager.IMPORTANCE_DEFAULT
			)
		}
		appChannels[appDomain] = channel
		return channel
	}

	fun publishAppNotification(appDomain: String, title: String, body: String, silent: Boolean): Int {
		val appNotifications = getOrMakeAppNotificationsChannel(appDomain)
		val notificationId = nextNotificationId()
		val notification = NotificationCompat.Builder(ctx, appNotifications.channelId)
			.setSmallIcon(IconCompat.createWithBitmap(appNotifications.icon))
			.setLargeIcon(appNotifications.icon)
			.setContentTitle(title)
			.setContentText(body)
			.setPriority(NotificationCompat.PRIORITY_DEFAULT)
			.setSilent(silent)
			// can start launcher app only from app activity, so, startup talks to service that focuses/opens launcher
			.setContentIntent(ctx.intentForAppNotification(notificationId))
			.build()
		notifications.notify(notificationId, notification)
		appNotifications.notifIds.add(notificationId)
		return notificationId
	}

}

class AppNotifications(
	val appDomain: String,
	val icon: Bitmap
) {
	val channelId: String = appDomain
	val channelName: String = appDomain
	//
	val notifIds = mutableSetOf<Int>()
}









































