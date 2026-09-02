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

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import app.privacysafe.jsengine.InjectedSyncHandler
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromByteArray
import kotlinx.serialization.protobuf.ProtoBuf
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class DecryptWithDeviceKey : InjectedSyncHandler("keystore_decrypt") {

	@OptIn(ExperimentalSerializationApi::class)
	override fun call(argsBytes: ByteArray): ByteArray? {
		val (keyName, data) = ProtoBuf.decodeFromByteArray<CryptArgs>(argsBytes)
		val key = getKeyStore(keyName)
		return decrypt(key, data)
	}

	@Serializable
	data class CryptArgs(val keyName: String, val data: ByteArray)

}

class EncryptWithDeviceKey : InjectedSyncHandler("keystore_encrypt") {

	@OptIn(ExperimentalSerializationApi::class)
	override fun call(argsBytes: ByteArray): ByteArray? {
		val (keyName, data) = ProtoBuf.decodeFromByteArray<CryptArgs>(argsBytes)
		val key = getKeyStore(keyName)
		return encryptWithIVAtStart(key, data)
	}

	@Serializable
	data class CryptArgs(val keyName: String, val data: ByteArray)

}

private const val ANDROID_KEY_STORE = "AndroidKeyStore"
private const val IV_LEN = 12
private const val CIPHER_ALG = "AES/GCM/NoPadding"

private fun encryptWithIVAtStart(key: SecretKey, data: ByteArray): ByteArray {
	val encryptor = Cipher.getInstance(CIPHER_ALG)
	encryptor.init(Cipher.ENCRYPT_MODE, key)
	val encrypted = encryptor.doFinal(data)
	val iv = encryptor.iv
	assert(iv.size == IV_LEN)
	val encWithIV = ByteArray(encrypted.size + iv.size)
	iv.copyInto(encWithIV, 0)
	encrypted.copyInto(encWithIV, iv.size)
	return encWithIV
}

private fun decrypt(key: SecretKey, encWithIV: ByteArray): ByteArray {
	val decryptor = Cipher.getInstance(CIPHER_ALG)
	val iv = encWithIV.sliceArray(0..<IV_LEN)
	val encrypted = encWithIV.sliceArray(IV_LEN..<encWithIV.size)
	decryptor.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, iv))
	return decryptor.doFinal(encrypted)
}

private fun getKeyStore(keyName: String): SecretKey {
	val store = KeyStore.getInstance(ANDROID_KEY_STORE)
	store.load(null)
	if (!store.containsAlias(keyName)) {
		makeKeyAndAddStore(keyName, store)
	}
	val keyEntry = store.getEntry(keyName, null) as? KeyStore.SecretKeyEntry
	return keyEntry!!.secretKey
}

private fun makeKeyAndAddStore(keyName: String, store: KeyStore) {
	val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEY_STORE)
	generator.init(
		KeyGenParameterSpec.Builder(
			keyName,
			KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
		)
			.setKeySize(128)
			.setBlockModes(KeyProperties.BLOCK_MODE_GCM)
			.setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
			.build()
	)
	generator.generateKey();
}
