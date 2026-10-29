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
package app.privacysafe.jsengine.caps

import app.privacysafe.Notifications
import app.privacysafe.jsengine.InjectedSyncHandler
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromByteArray
import kotlinx.serialization.encodeToByteArray
import kotlinx.serialization.protobuf.ProtoBuf

class AddNotificationOp(
	private val notifications: Notifications
) : InjectedSyncHandler("notifications_add") {

	@OptIn(ExperimentalSerializationApi::class)
	override fun call(argsBytes: ByteArray): ByteArray {
		val (
			appDomain, title, body, silent
		) = ProtoBuf.decodeFromByteArray<AddNotificationsArgs>(argsBytes)
		val id = notifications.publishAppNotification(appDomain, title, body, silent)
		return ProtoBuf.encodeToByteArray(NotificationId(id))
	}

}

@Serializable
data class AddNotificationsArgs(val appDomain: String, val title: String, val body: String, val silent: Boolean)

@Serializable
data class NotificationId(val id: Int)

class RemoveNotificationOp(
	private val notifications: Notifications
) : InjectedSyncHandler("notifications_remove") {

	@OptIn(ExperimentalSerializationApi::class)
	override fun call(argsBytes: ByteArray): ByteArray? {
		val (id) = ProtoBuf.decodeFromByteArray<NotificationId>(argsBytes)
		notifications.removeAppNotification(id)
		return null
	}

}
