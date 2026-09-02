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
package app.privacysafe

import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity

class SystemDialogActivity : ComponentActivity() {

	override fun onCreate(savedInstanceState: Bundle?) {
		super.onCreate(savedInstanceState)
		setContentView(R.layout.system_dialogs_layout)
		val dialog = AlertDialog.Builder(this)
			.setTitle(intent.extras?.getString(DIALOG_TITLE) ?: "")
			.setMessage(intent.extras?.getString(DIALOG_CONTENT) ?: "")
			.setOnCancelListener { finish() }
			.setOnDismissListener { finish() }
		dialog.show()
	}

}

fun startSystemDialogTask(ctx: Context, title: String, content: String) {
	val intent = Intent(ctx, SystemDialogActivity::class.java)
		.setAction(Intent.ACTION_MAIN)
		.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
		.putExtra(DIALOG_TITLE, title)
		.putExtra(DIALOG_CONTENT, content)
	ctx.startActivity(intent)
}

private const val DIALOG_TITLE = "dialog.title"
private const val DIALOG_CONTENT = "dialog.content"
