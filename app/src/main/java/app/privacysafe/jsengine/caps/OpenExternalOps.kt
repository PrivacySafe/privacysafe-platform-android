package app.privacysafe.jsengine.caps

import app.privacysafe.jsengine.InjectedSyncHandler
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.decodeFromByteArray
import kotlinx.serialization.protobuf.ProtoBuf

typealias OpenExternalFn = (url: String) -> Unit

class OpenExternalOps(
	private val fn: OpenExternalFn
) : InjectedSyncHandler("open_external") {

	@OptIn(ExperimentalSerializationApi::class)
	override fun call(argsBytes: ByteArray): ByteArray? {
		val (url) = ProtoBuf.decodeFromByteArray<StringValue>(argsBytes)
		fn(url)
		return null
	}

}