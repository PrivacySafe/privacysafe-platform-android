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

import { CoreDriver } from "../../platform/core";
import { getLaunchersForUser, MAIN_GUI_ENTRYPOINT } from "../../platform/lib-common/manifest-utils";
import { StartupApp } from "../../platform/user-apps";
import { appManifestOnDev } from "../jsengine/caps/system-places";
import { deviceFormFactor, STARTUP_APP_DOMAIN } from "../jsengine/confs";
import { closeAndroidActivity, focusAndroidActivity, startAndroidActivity } from "../jsengine/ops/android-activities";
import { ConnectorsAndComponents } from "./connectors-on-core-side";

type StartupW3N = web3n.caps.startup.W3N;

const ID_OF_INIT_SCREEN = "init";

export class StartupAppInAndroid implements StartupApp {

	private readonly onCloseListeners: (() => void)[] = [];
  private connectorId: string|undefined = undefined;

  private constructor() {
    Object.seal(this);
  }

  static instantiate(
    startCore: CoreDriver['start'],
    provideW3NForActivity: (w3n: StartupW3N) => ReturnType<ConnectorsAndComponents['connectW3N']>
  ): {
		startupApp: StartupAppInAndroid;
		startProc: Promise<void>;
		coreInit: Promise<void>;
	} {
		const { capsForStartup, coreInit } = startCore();
    const startProc = appManifestOnDev(STARTUP_APP_DOMAIN)
    .then(async manifest => {
      const launchers = getLaunchersForUser(manifest, deviceFormFactor());
			const entrypoint = launchers?.[0]?.component || MAIN_GUI_ENTRYPOINT;
      const { connectorId, setComponent } = provideW3NForActivity(capsForStartup as StartupW3N);
      startupApp.connectorId = connectorId;
      setComponent({
        connectorId, entrypoint, appRoot: undefined as any,
        close: () => startupApp.close()
      });
    });
    const startupApp = new StartupAppInAndroid();
    return { coreInit, startProc, startupApp };
  }

  doWhenWindowCompletes(handler: () => void): void {
		this.onCloseListeners.push(handler);
  }

  focusWindow(): void {
    if (this.connectorId) {
      focusAndroidActivity(this.connectorId).catch(_ => this.close());
    }
  }

  close(): void {
		for (const listener of this.onCloseListeners) {
			try {
				listener();
			} catch (_) {}
		}
		this.onCloseListeners.splice(0, this.onCloseListeners.length);
    if (this.connectorId) {
      closeAndroidActivity(this.connectorId).catch(noop);
    }
  }

}

function noop() {}
