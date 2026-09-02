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
package app.privacysafe.jsengine.ops

import app.privacysafe.jsengine.InjectedAsyncHandler
import kotlinx.coroutines.delay
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromByteArray
import kotlinx.serialization.protobuf.ProtoBuf

class DelayFn : InjectedAsyncHandler("delay") {

	@OptIn(ExperimentalSerializationApi::class)
	override suspend fun call(argsBytes: ByteArray): ByteArray? {
		val (millis) = ProtoBuf.decodeFromByteArray<MillisArgs>(argsBytes)
		delay(millis)
		return null
	}

	@Serializable
	private data class MillisArgs(val millis: Long)

}
