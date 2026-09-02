package app.privacysafe

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Context.NOTIFICATION_SERVICE
import android.content.Intent

class InitOnBoot : BroadcastReceiver() {

	override fun onReceive(ctx: Context?, intent: Intent?) {
		if (intent?.action == null) {
			return
		}
		val mngr: NotificationManager = ctx!!.getSystemService(NOTIFICATION_SERVICE) as NotificationManager
		addCoreRunnerNotificationChannelTo(ctx, mngr)
		startCoreRunnerService(ctx)
	}

}