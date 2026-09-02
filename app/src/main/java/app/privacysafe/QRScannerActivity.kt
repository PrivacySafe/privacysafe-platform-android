package app.privacysafe

import android.Manifest
import android.app.ComponentCaller
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.util.Log
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import com.google.zxing.integration.android.IntentIntegrator
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanIntentResult
import com.journeyapps.barcodescanner.ScanOptions

class QRScannerActivity : ComponentActivity() {

	override fun onCreate(savedInstanceState: Bundle?) {
		super.onCreate(savedInstanceState)
		setContentView(R.layout.qrscanner_layout)
		val scanQrResultLauncher = registerForActivityResult(
			ActivityResultContracts.StartActivityForResult()
		) { actRes ->
			Log.d("w3n", "got $actRes")
			val scanRes = ScanIntentResult.parseActivityResult(actRes.resultCode, actRes.data)
			if (scanRes.contents == null) {
				Log.d("w3n", "\n ----- \n Nothing scanned \n")
			} else {
				Log.d("w3n", "\n ----- \n Scanned ${scanRes.contents} \n")
			}
		}
		val opts = ScanOptions()
			.setDesiredBarcodeFormats(ScanOptions.QR_CODE)
			.setPrompt("Point to PrivacySafe QR")
			.setBeepEnabled(true)
//			.setTimeout(30000)
		scanQrResultLauncher.launch(ScanContract().createIntent(applicationContext, opts))
//		if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
//			launchScanner()
//		} else {
//			if (shouldShowRequestPermissionRationale(Manifest.permission.CAMERA)) {
//				Toast.makeText(this, "Allow camera to scan QR code", Toast.LENGTH_LONG)
//					.show()
//			}
//			requestPermissions(arrayOf(Permission.Camera.name), Permission.Camera.requestCode)
//		}
	}

//	override fun onRequestPermissionsResult(
//		requestCode: Int,
//		permissions: Array<out String?>,
//		grantResults: IntArray,
//		deviceId: Int
//	) {
//		super.onRequestPermissionsResult(requestCode, permissions, grantResults, deviceId)
//		if (requestCode != Permission.Camera.requestCode) {
//			return
//		}
//		if (grantResults.isNotEmpty() && (grantResults[0] == PackageManager.PERMISSION_GRANTED)) {
//			launchScanner()
//		} else {
//			Toast.makeText(this, "Cannot scan QR without permission to use camera", Toast.LENGTH_LONG)
//				.show()
//			finish()
//		}
//	}
//
//	private fun launchScanner() {
//		val integrator = IntentIntegrator(this)
//		integrator.setDesiredBarcodeFormats(IntentIntegrator.QR_CODE)
//		integrator.setOrientationLocked(true)
//		integrator.setBeepEnabled(true)
//		integrator.setTimeout(30000)
//		integrator.initiateScan()
//	}
//
//	override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?, caller: ComponentCaller) {
//		super.onActivityResult(requestCode, resultCode, data, caller)
//	}

}

fun startQRScanner(ctx: Context) {
	val intent = Intent(ctx, QRScannerActivity::class.java)
		.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
	ctx.startActivity(intent)
}