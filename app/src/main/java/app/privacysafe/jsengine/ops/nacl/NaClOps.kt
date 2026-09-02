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
package app.privacysafe.jsengine.ops.nacl

import app.privacysafe.computeAsync
import app.privacysafe.jsengine.InjectedAsyncHandler
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromByteArray
import kotlinx.serialization.protobuf.ProtoBuf
import java.util.concurrent.Executor

class NaclSBoxOpenOp(
	private val executor: Executor
) : InjectedAsyncHandler("nacl_sbox_open")  {

	@OptIn(ExperimentalSerializationApi::class)
	override suspend fun call(argsBytes: ByteArray): ByteArray? {
		val (c, n, k) = ProtoBuf.decodeFromByteArray<OpenArgs>(argsBytes)
		return executor.computeAsync {
			nacl.SecretBox.open(c, n, k)
		}
	}

	@Serializable
	private data class OpenArgs(val c: ByteArray, val n: ByteArray, val k: ByteArray)

}

class NaclSBoxPackOp(
	private val executor: Executor
) : InjectedAsyncHandler("nacl_sbox_pack")  {

	@OptIn(ExperimentalSerializationApi::class)
	override suspend fun call(argsBytes: ByteArray): ByteArray? {
		val (m, n, k) = ProtoBuf.decodeFromByteArray<PackArgs>(argsBytes)
		return executor.computeAsync {
			nacl.SecretBox.seal(m, n, k)
		}
	}

	@Serializable
	private data class PackArgs(val m: ByteArray, val n: ByteArray, val k: ByteArray)

}
