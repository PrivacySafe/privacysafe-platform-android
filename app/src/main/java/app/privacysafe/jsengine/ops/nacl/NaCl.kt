@file:OptIn(ExperimentalUnsignedTypes::class)

package app.privacysafe.jsengine.ops.nacl

import android.util.Log

/**
 * Provides a high-level, safe, and convenient API for the TweetNaCl cryptographic library.
 * This object handles all necessary padding, buffer management, and length checks,
 * wrapping the low-level functions from NaClLowLevel.
 */
object nacl {

    // --- Private Implementation Constants ---
    // These are for managing the zero-padding required by the low-level API.
    private const val ZEROBYTES = 32
    private const val BOXZEROBYTES = 16


    /**
     * Authenticated Symmetric Encryption (secretbox)
     */
    object SecretBox {
        const val KeySize = 32
        const val NonceSize = 24

        /**
         * Encrypts and authenticates a message using a secret key and a nonce.
         */
        fun seal(message: ByteArray, nonce: ByteArray, key: ByteArray): ByteArray {
            require(key.size == KeySize) { "Invalid key size" }
            require(nonce.size == NonceSize) { "Invalid nonce size" }

            // 1. Create a padded message buffer: [32 zeros][message]
            val m = ByteArray(ZEROBYTES + message.size)
            message.copyInto(m, destinationOffset = ZEROBYTES)

            // 2. Create an output buffer of the same size.
            val c = ByteArray(m.size)

            // 3. Call the low-level seal function.
            NaClLowLevel.crypto_secretbox(c, m, m.size.toLong(), nonce, key)

            // 4. The result in `c` is [16-byte MAC][16 bytes garbage][ciphertext].
            // We return only the MAC and the ciphertext.
            return c.copyOfRange(BOXZEROBYTES, c.size)
        }

        /**
         * Verifies and decrypts a ciphertext.
         */
        fun open(box: ByteArray, nonce: ByteArray, key: ByteArray): ByteArray? {
            require(key.size == KeySize) { "Invalid key size" }
            require(nonce.size == NonceSize) { "Invalid nonce size" }

            // The user provides the `box`, which is [MAC][ciphertext].
            // We need to re-create the format the low-level function expects.
            // 1. Create a buffer for the ciphertext: [16 empty bytes][box]
            val c = ByteArray(BOXZEROBYTES + box.size)
            box.copyInto(c, destinationOffset = BOXZEROBYTES)

            // 2. Create an output buffer for the decrypted, padded message.
            val m = ByteArray(c.size)

            // 3. Call the low-level open function.
            val status = NaClLowLevel.crypto_secretbox_open(m, c, c.size.toLong(), nonce, key)
            if (status != 0) {
                Log.d("w3n", "verification failed")
                return null
            }

            // 4. If successful, `m` contains [32 bytes garbage][decrypted message].
            // We must slice off the padding before returning.
            return m.copyOfRange(ZEROBYTES, m.size)
        }
    }
}
