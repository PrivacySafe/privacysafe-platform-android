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

// injecting global's expected to be on node, before everything else
import { makePlatformDeviceFS } from "./ops/fs";
globalThis.platform = {
	device_fs: makePlatformDeviceFS()
};

import { InitProc } from "../init-proc";
import { makeCoreDriver } from "../../platform/core";
import { makeSystemPlaces } from "./caps/system-places";
import { AppDownloader } from "../../platform/caps/system/apps-downloader";
import { appDirs } from "core-3nweb-client-lib";
import { deviceFormFactor, LAUNCHER_APP_DOMAIN, loggerToFileAndConsole, makeUICap, SIGNUP_URL, sysFilesOnDevice } from "./confs";
import { makeNetworksParts } from "./networks";
import { makeRandom } from "./ops/random";
import { showSystemErrorBox } from "./ops/android-activities";
import { makeConnectivity } from "./caps/connectivity";
import { fnsForAndroid } from "./runtime-ipc-via-ports";
import { init as pb } from '../protos/init.proto';
import { ProtoType } from "../../platform/lib-common/protobuf-msg";
import { exposeInitProcFns } from "./exposing-fns-to-android";
import { ConnectorsAndComponents } from "../app-n-components/connectors-on-core-side";
import { UserLogin } from "./caps/user-login";
import { makeAutoStartupCAP } from "./caps/user-login/auto-startup";
import { PlatformResources } from "../../platform/inject-defs/platform";
import { Logging } from "../../platform/inject-defs/confs";
import { hashing } from 'ecma-nacl';
import { makeHybridCryptor } from "./hybrid-cryptor/from-android-and-in-proc-wasm";
import { makeOpenURLCAP } from "./caps/openers";
import { notificationsMaker } from "./caps/user-notifications";
// import { makeInProcessWasmCryptor } from "ecma-nacl-cryptors";
// import { scanUrlQR } from "./caps/scan-qr";


(function() {

  async function sha512(bytes: Buffer): Promise<string> {
    return (hashing.sha512.hash(bytes) as any).toBase64();
  }

  function makePlatformResources(utilDir: string, logging: Logging): PlatformResources {

    const { makeNetClient, makeServiceLocator, networks } = makeNetworksParts();

    function clearLogsDirAndScheduleNextCleanup() {
      logging.removeOlderLogs();
      setTimeout(clearLogsDirAndScheduleNextCleanup, 3*60*60*1000);
    }
    clearLogsDirAndScheduleNextCleanup();

    return {
      caps: {
        makeAppDownloader: sysPlaces => new AppDownloader(
          sysPlaces, makeServiceLocator('w3nApp', logging.logError), makeNetClient(), sha512
        ),
        makeAutoStartupCAP,
        makeSystemPlaces: storages => makeSystemPlaces(storages, logging.logError),
        makeUICap,
        makeMediaDevicesCAP: undefined,
        makeConnectivity,
        shell: {
          makeClipboardCAP: undefined,
          makeOpenFileCAP: undefined,
          makeOpenFolderCAP: undefined,
          makeOpenURLCAP,
          openInMountedFolderCAP: undefined,
          makeMountsCAP: undefined,
          makeNotifications: notificationsMaker(logging.logError),
          // scanUrlQR
        }
      },
      LAUNCHER_APP_DOMAIN,
      logging,
      makeCryptor: makeHybridCryptor,
      random: makeRandom(),
      makeNetClient,
      makeServiceLocator,
      makeUserLogin: (userId, getKeyFromPass) => UserLogin.make(
        utilDir, logging.logError, userId, getKeyFromPass
      ),
      showSystemErrorBox,
      getServiceForCAP: undefined,
      getSytemFormFactor: deviceFormFactor,
      sysFilesOnDevice
    };
  }

  /**
   * This triggers init process, and can be called only once.
   * dataDir in args is a data directory, like used on all other OS's.
   */
  async function init({ dataDir }: DataDirArgs) {
    fnsForAndroid.removeFn(init);

    const utilDir = appDirs(dataDir).getUtilFS();
    const logging = loggerToFileAndConsole(utilDir);

    const connectors = new ConnectorsAndComponents();

    const initProc = new InitProc(
      makeCoreDriver,
      connectors,
      {
        dataDir,
        signUpUrl: SIGNUP_URL
      },
      makePlatformResources(utilDir, logging),
      utilDir,
      logging
    );

    exposeInitProcFns(initProc);

  }
  interface DataDirArgs { dataDir: string; }
  fnsForAndroid.exposeFn(
    init,
    ProtoType.for<DataDirArgs>(pb.DataDirArgs),
    undefined
  );

})();
