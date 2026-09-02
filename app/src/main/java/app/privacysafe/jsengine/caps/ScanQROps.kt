package app.privacysafe.jsengine.caps

import app.privacysafe.jsengine.InjectedSyncHandler
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.decodeFromByteArray
import kotlinx.serialization.encodeToByteArray
import kotlinx.serialization.protobuf.ProtoBuf

typealias ScanUrlQR = (prefixies: Array<String>) -> String?

class ScanUrlQROps(
	private val fn: ScanUrlQR
) : InjectedSyncHandler("scan_url_qr") {

	@OptIn(ExperimentalSerializationApi::class)
	override fun call(argsBytes: ByteArray): ByteArray? {
		val (prefixies) = ProtoBuf.decodeFromByteArray<StringArrayValue>(argsBytes)
		val scanned = fn(prefixies)
		return if (scanned == null) { null } else {
			ProtoBuf.encodeToByteArray(StringValue(scanned))
		}
	}

}