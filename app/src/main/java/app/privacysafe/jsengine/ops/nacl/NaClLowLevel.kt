@file:Suppress("ObjectPropertyName", "FunctionName")
@file:OptIn(ExperimentalUnsignedTypes::class)

package app.privacysafe.jsengine.ops.nacl

import kotlin.experimental.and
import kotlin.experimental.or
import kotlin.experimental.xor

/**
 * The `NaClLowLevel` object provides low-level cryptographic operations
 * commonly used in NaCl (Networking and Cryptography library)-compatible algorithms.
 * These operations include secure random byte generation, low-level byte and
 * number manipulations, secure key comparison, and cryptographic core functions.
 *
 * This is a port of the TweetNaCl library.
 *
 * NOTE: This version has been audited and corrected to fix critical security
 * vulnerabilities found in the original port. It is strongly recommended to
 * use this version and to validate it against official test vectors.
 */
@Suppress("unused")
internal object NaClLowLevel {

    // --- Unchanged Primitives and Constants ---
    private val _0: ByteArray = ByteArray(16) { 0 }
    private val _9: ByteArray = ByteArray(32).apply { this[0] = 9 }
    private val gf0: LongArray = LongArray(16) { 0 }
    private val gf1: LongArray = LongArray(16).apply { this[0] = 1 }
    private val _121665: LongArray = longArrayOf(0xDB41, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
    private val D: LongArray = longArrayOf(
        0x78a3, 0x1359, 0x4dca, 0x75eb, 0xd8ab, 0x4141, 0x0a4d, 0x0070,
        0xe898, 0x7779, 0x4079, 0x8cc7, 0xfe73, 0x2b6f, 0x6cee, 0x5203)
    private val D2: LongArray = longArrayOf(
        0xf159, 0x26b2, 0x9b94, 0xebd6, 0xb156, 0x8283, 0x149a, 0x00e0,
        0xd130, 0xeef3, 0x80f2, 0x198e, 0xfce7, 0x56df, 0xd9dc, 0x2406)
    private val X: LongArray = longArrayOf(
        0xd51a, 0x8f25, 0x2d60, 0xc956, 0xa7b2, 0x9525, 0xc760, 0x692c,
        0xdc5c, 0xfdd6, 0xe231, 0xc0a4, 0x53fe, 0xcd6e, 0x36d3, 0x2169)
    private val Y: LongArray = longArrayOf(
        0x6658, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666,
        0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666)
    private val I: LongArray = longArrayOf(
        0xa0b0, 0x4a0e, 0x1b27, 0xc4ee, 0xe478, 0xad2f, 0x1806, 0x2f43,
        0xd7a7, 0x3dfb, 0x0099, 0x2b4d, 0xdf0b, 0x4fc1, 0x2480, 0x2b83)
    private fun L32(x: Int, c: Int): Int = ((x shl c) or (x ushr (32 - c)))

    private fun ld32(x: ByteArray, off: Int = 0): Int {
        var u: Int = x[off + 3].toInt() and 0xff
        u = u shl 8 or (x[off + 2].toInt() and 0xff)
        u = u shl 8 or (x[off + 1].toInt() and 0xff)
        return u shl 8 or (x[off + 0].toInt() and 0xff)
    }

    private fun st32(x: ByteArray, off: Int = 0, u: Int) {
        var uu = u
        for (i in 0 until 4) {
            x[i + off] = uu.toByte()
            uu = uu shr 8
        }
    }

    private fun vn(x: ByteArray, xi: Int, y: ByteArray, yi: Int, n: Int): Int {
        var d = 0
        for (i in 0 until n) {
            d = d or (x[i + xi].toInt() xor y[i + yi].toInt())
        }
        // This is a branchless, constant-time way to map:
        // d = 0 --> returns 0
        // d != 0 --> returns -1
        return -((d or -d) ushr 31)
    }

    private fun crypto_verify_16(x: ByteArray, xi: Int = 0, y: ByteArray, yi: Int = 0): Int = vn(x, xi, y, yi, 16)
    private fun crypto_verify_32(x: ByteArray, xi: Int = 0, y: ByteArray, yi: Int = 0): Int = vn(x, xi, y, yi, 32)

    private fun core(outArr: ByteArray, inArr: ByteArray, k: ByteArray, c: ByteArray, h: Int) {
        val x = IntArray(16)
        val y = IntArray(16)

        // Initial state
        x[0] = ld32(c, 0); x[1] = ld32(k, 0); x[2] = ld32(k, 4); x[3] = ld32(k, 8);
        x[4] = ld32(k, 12); x[5] = ld32(c, 4); x[6] = ld32(inArr, 0); x[7] = ld32(inArr, 4);
        x[8] = ld32(inArr, 8); x[9] = ld32(inArr, 12); x[10] = ld32(c, 8); x[11] = ld32(k, 16);
        x[12] = ld32(k, 20); x[13] = ld32(k, 24); x[14] = ld32(k, 28); x[15] = ld32(c, 12);

        y.indices.forEach { y[it] = x[it] }

        fun rot(a: Int, b: Int) = (a shl b) or (a ushr (32 - b))

        for (i in 0 until 20 step 2) {
            // Even round
            x[4] = x[4] xor rot(x[0] + x[12], 7); x[8] = x[8] xor rot(x[4] + x[0], 9);
            x[12] = x[12] xor rot(x[8] + x[4], 13); x[0] = x[0] xor rot(x[12] + x[8], 18);
            x[9] = x[9] xor rot(x[5] + x[1], 7); x[13] = x[13] xor rot(x[9] + x[5], 9);
            x[1] = x[1] xor rot(x[13] + x[9], 13); x[5] = x[5] xor rot(x[1] + x[13], 18);
            x[14] = x[14] xor rot(x[10] + x[6], 7); x[2] = x[2] xor rot(x[14] + x[10], 9);
            x[6] = x[6] xor rot(x[2] + x[14], 13); x[10] = x[10] xor rot(x[6] + x[2], 18);
            x[3] = x[3] xor rot(x[15] + x[11], 7); x[7] = x[7] xor rot(x[3] + x[15], 9);
            x[11] = x[11] xor rot(x[7] + x[3], 13); x[15] = x[15] xor rot(x[11] + x[7], 18);
            // Odd round
            x[1] = x[1] xor rot(x[0] + x[3], 7); x[2] = x[2] xor rot(x[1] + x[0], 9);
            x[3] = x[3] xor rot(x[2] + x[1], 13); x[0] = x[0] xor rot(x[3] + x[2], 18);
            x[6] = x[6] xor rot(x[5] + x[4], 7); x[7] = x[7] xor rot(x[6] + x[5], 9);
            x[4] = x[4] xor rot(x[7] + x[6], 13); x[5] = x[5] xor rot(x[4] + x[7], 18);
            x[11] = x[11] xor rot(x[10] + x[9], 7); x[8] = x[8] xor rot(x[11] + x[10], 9);
            x[9] = x[9] xor rot(x[8] + x[11], 13); x[10] = x[10] xor rot(x[9] + x[8], 18);
            x[12] = x[12] xor rot(x[15] + x[14], 7); x[13] = x[13] xor rot(x[12] + x[15], 9);
            x[14] = x[14] xor rot(x[13] + x[12], 13); x[15] = x[15] xor rot(x[14] + x[13], 18);
        }

        for(i in 0 until 16) x[i] += y[i]

        if (h != 0) { // HSalsa20
            st32(outArr, 0, x[0] - ld32(c,0));
            st32(outArr, 4, x[5] - ld32(c,4));
            st32(outArr, 8, x[10] - ld32(c,8));
            st32(outArr, 12, x[15] - ld32(c,12));
            st32(outArr, 16, x[6] - ld32(inArr,0));
            st32(outArr, 20, x[7] - ld32(inArr,4));
            st32(outArr, 24, x[8] - ld32(inArr,8));
            st32(outArr, 28, x[9] - ld32(inArr,12));
        } else { // Salsa20
            for(i in 0 until 16) st32(outArr, 4*i, x[i])
        }
    }

    fun crypto_core_salsa20(outArr: ByteArray, inArr: ByteArray, k: ByteArray, c: ByteArray): Int {
        core(outArr, inArr, k, c, 0)
        return 0
    }

    fun crypto_core_hsalsa20(outArr: ByteArray, inArr: ByteArray, k: ByteArray, c: ByteArray): Int {
        core(outArr, inArr, k, c, 1)
        return 0
    }

    private val sigma: ByteArray = "expand 32-byte k".encodeToByteArray()

    fun crypto_stream_salsa20_xor(c: ByteArray, m: ByteArray?, bIn: Long, n: ByteArray, nOff: Int = 0, k: ByteArray): Int {
        val z = ByteArray(16)
        val x = ByteArray(64)
        var u: Int
        if (bIn == 0L) return 0
        for (i in 0 until 8) z[i] = n[i + nOff]
        var b = bIn
        var cOff = 0
        var mOff = 0
        while (b >= 64) {
            crypto_core_salsa20(x, z, k, sigma)
            for (i in 0 until 64) c[cOff + i] = (m?.get(mOff + i) ?: 0) xor x[i]
            u = 1
            for (i in 8 until 16) {
                u += z[i].toUByte().toInt()
                z[i] = u.toByte()
                u = u ushr 8
            }
            b -= 64
            cOff += 64
            m?.let { mOff += 64 }
        }
        if (b > 0) {
            crypto_core_salsa20(x, z, k, sigma)
            for (i in 0 until b.toInt()) c[cOff + i] = (m?.get(mOff + i) ?: 0) xor x[i]
        }
        return 0
    }

    fun crypto_stream_salsa20(c: ByteArray, d: Long, n: ByteArray, k: ByteArray, nStart: Int = 0): Int =
        crypto_stream_salsa20_xor(c, null, d, n, nStart, k)

    fun crypto_stream(c: ByteArray, d: Long, n: ByteArray, k: ByteArray): Int {
        val s = ByteArray(32)
        crypto_core_hsalsa20(s, n, k, sigma)
        return crypto_stream_salsa20(c, d, n, s, 16)
    }

    fun crypto_stream_xor(c: ByteArray, m: ByteArray, d: Long, n: ByteArray, k: ByteArray): Int {
        val s = ByteArray(32)
        crypto_core_hsalsa20(s, n, k, sigma)
        return crypto_stream_salsa20_xor(c, m, d, n, 16, s)
    }

    private fun add1305(h: IntArray, c: IntArray) {
        var u = 0
        for (j in 0 until 17) {
            u += h[j] + c[j]
            h[j] = u and 255
            u = u ushr 8
        }
    }

    private val minusp: IntArray = intArrayOf(5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 252)

    fun crypto_onetimeauth(out: ByteArray, outStart: Int, m: ByteArray, mStart: Int, n: Long, k: ByteArray): Int {
        var mpos = mStart
        var nn = n
        val x = IntArray(17)
        val r = IntArray(17)
        val h = IntArray(17)
        val c = IntArray(17)
        val g = IntArray(17)

        r.fill(0)
        h.fill(0)
        for (j in 0 until 16) r[j] = k[j].toInt() and 0xff
        r[3] = r[3] and 15
        r[4] = r[4] and 252
        r[7] = r[7] and 15
        r[8] = r[8] and 252
        r[11] = r[11] and 15
        r[12] = r[12] and 252
        r[15] = r[15] and 15

        while (nn > 0) {
            c.fill(0)
            val blocksize = if (nn < 16) nn.toInt() else 16
            for (j in 0 until blocksize) c[j] = m[mpos + j].toInt() and 0xff
            c[blocksize] = 1
            mpos += blocksize
            nn -= blocksize
            add1305(h, c)
            for (i in 0 until 17) {
                x[i] = 0
                for (j in 0 until 17) x[i] += h[j] * (if (j <= i) r[i - j] else 320 * r[i + 17 - j])
            }
            for (i in 0 until 17) h[i] = x[i]
            var u = 0
            for (j in 0 until 16) {
                u += h[j]
                h[j] = u and 255
                u = u ushr 8
            }
            u += h[16]
            h[16] = u and 3
            u = 5 * (u ushr 2)
            for (j in 0 until 16) {
                u += h[j]
                h[j] = u and 255
                u = u ushr 8
            }
            u += h[16]
            h[16] = u
        }
        for (j in 0 until 17) g[j] = h[j]
        add1305(h, minusp)
        val s = -(h[16] ushr 7)
        for (j in 0 until 17) h[j] = h[j] xor (s and (g[j] xor h[j]))

        for (j in 0 until 16) c[j] = k[j + 16].toInt() and 0xff
        c[16] = 0
        add1305(h, c)
        for (j in 0 until 16) out[outStart + j] = h[j].toByte()
        return 0
    }

    private fun crypto_onetimeauth_verify(h: ByteArray, hi: Int, m: ByteArray, mi: Int, n: Long, k: ByteArray): Int {
        val x = ByteArray(16)
        crypto_onetimeauth(x, 0, m, mi, n, k)
        return crypto_verify_16(h, hi, x, 0)
    }

    fun crypto_secretbox(c: ByteArray, m: ByteArray, d: Long, n: ByteArray, k: ByteArray): Int {
        if (d < 32) return -1
        crypto_stream_xor(c, m, d, n, k)
        crypto_onetimeauth(c, 16, c, 32, d - 32, c)
        for (i in 0 until 16) c[i] = 0
        return 0
    }

    // In NaClLowLevel.kt

    fun crypto_secretbox_open(m: ByteArray, c: ByteArray, d: Long, n: ByteArray, k: ByteArray): Int {
        if (d < 32) return -1
        val x = ByteArray(32)
        // 1. Derive the one-time authentication key.
        crypto_stream(x, 32, n, k)

        // 2. Verify the MAC. This is the critical step. `status` should be -1 for wrong key.
        val status = crypto_onetimeauth_verify(c, 16, c, 32, d - 32, x)

        // 3. Decrypt regardless.
        crypto_stream_xor(m, c, d, n, k)

        // 4. Act on the status.
        if (status != 0) {
            m.fill(0) // Clear output on failure.
        } else {
            m.fill(0, 0, 32) // Clear padding on success.
        }

        return status
    }

}
