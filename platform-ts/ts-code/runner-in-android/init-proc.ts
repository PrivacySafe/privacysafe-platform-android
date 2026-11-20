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

import type { CoreConf } from "core-3nweb-client-lib";
import { autologinFromStartup, type CoreDriver, type makeCoreDriver } from "../platform/core";
import type { PlatformResources } from "../platform/inject-defs/platform";
import { UserApps } from "../platform/user-apps";
import { Sites } from "../platform/inject-defs/sites";
import { LiveAppsInAndroid } from "./app-n-components";
import { GetAppStorage, LiveApps } from "../platform/apps/live-apps";
import type { SystemPlaces } from "../platform/caps/system/system-places";
import { defer, Deferred } from "../platform/lib-common/processes/deferred";
import { StartupAppInAndroid } from "./app-n-components/startup-app";
import { ComponentForAndroidAccess, ConnectorsAndComponents } from "./app-n-components/connectors-on-core-side";
import { getCurrentVersion } from "./jsengine/caps/platform";
import { exitAll } from "./jsengine/ops/android-activities";
import { STARTUP_APP_DOMAIN } from "./jsengine/confs";
import { lookForAutologinUsers, saveUserKeyForAutologin } from "./jsengine/caps/user-login";
import { Logging } from "../platform/inject-defs/confs";
import { mkdir } from "../platform/lib-common/async-fs-node";
import { toCanonicalAddress } from "../platform/lib-common/canonical-address";
import { openExternalUrl } from "./jsengine/caps/shell/openers";
import { DevApps } from "../platform/inject-defs/test-stand";
import { parse3NWebURL, SysCmd } from "./custom-url-schemas";
import { CONTACTS_APP_DOMAIN } from "./bundle-confs";
import { mountIntoOS } from "./jsengine/caps/shell/mounts";
import { BooleanValue, booleanValueType, fnsForAndroid, IntValue, intValueType, StringArrayValue, stringArrayValueType, StringValue, stringValueType } from "./jsengine/runtime-ipc-via-ports";
import { init as initPb } from './protos/init.proto';
import { components as pb } from './protos/components.proto';
import { FileException } from "../platform/lib-common/exceptions/file";
import { ProtoType } from "../platform/lib-common/protobuf-msg";
import { isBundledApp as isBundled } from "./jsengine/caps/system-places";

type WritableFS = web3n.files.WritableFS;
type ReadonlyFS = web3n.files.ReadonlyFS;
type SetAutoLogin = web3n.caps.startup.SetAutoLogin;
type DefaultProviderSite = web3n.caps.startup.DefaultProviderSite;
type CmdParams = web3n.shell.commands.CmdParams;

/**
 * This init only handles one user.
 * More so, Android service may completely close runtime with this and reinstatiate for login with different user.
 * 
 */
export class InitProc {

  private userApps: UserApps|undefined = undefined;
  private apps: LiveAppsInAndroid = undefined as any;

  // for now this is a single-user platform setup, thus, we can have single deferred expecting only one userId
  private deferredLogin: Deferred<string>|undefined = defer();

	private readonly mounting = mountIntoOS();

  constructor(
		private readonly makeDriver: typeof makeCoreDriver,
    private readonly connectors: ConnectorsAndComponents,
    private readonly conf: CoreConf,
		private readonly r: PlatformResources,
    private readonly utilDir: string,
    private readonly platformVersion: string,
    private readonly logging: Logging
  ) {}

  private makeUserApps(): UserApps {
    const userApps = new UserApps(
      this.makeDriver, this.conf, this.makeAppsAndSites.bind(this),
      undefined, () => false, undefined, () => this.platformCAP, this.mounting.makeUserMount, this.r
    );
    userApps.event$.subscribe({
      next: ev => {
        if ((typeof ev === 'object') && (ev.type === 'closed')) {
          exitAll();
        }
      }
    });
    return userApps;
  }

  private makeAppsAndSites (
		findInstalledApp: SystemPlaces['findInstalledApp'],
    appAndManifestOnDev: SystemPlaces['appAndManifestOnDev'],
		makeAppCAPs: CoreDriver['makeCAPsForAppComponent'],
		getAppStorage: (appDomain: string) => GetAppStorage,
		devApps: DevApps['getAppParams']|undefined,
		makeSiteCAPs: CoreDriver['makeCAPsForSiteComponent'],
		guiPlacementFS: Promise<WritableFS>,
		userId: () => string
	): { apps: LiveApps; sites: Sites; } {
		const apps = new LiveAppsInAndroid(
      this.r.getSytemFormFactor, findInstalledApp, appAndManifestOnDev, makeAppCAPs, getAppStorage,
      this.connectors.connectW3N.bind(this.connectors),
      this.r.logging
		);
    this.apps = apps;
		const sites: Sites = {
      openSiteComponent: stub('openSiteComponent'),
      focusOnSiteComponentIfOpened: stub('focusOnSiteComponentIfOpened'),
      devOpenSiteComponent: stub('devOpenSiteComponent'),
    };
		return { apps, sites };
	}

  private async startLogin(): ReturnType<InitProc['launchAppFromAndroid']> {
    await mkdir(this.utilDir, { recursive: true });
    if (this.userApps?.coreStarted) {
      throw new Error(`Login has already been started, and user is logged in`);
    }
    const deferredComponent = defer<ComponentForAndroidAccess>();
    const { enableAutologin, getUserKeyForAutologin, saveUserKey } = autologinFromStartup();
    this.userApps = this.makeUserApps();
    if (await this.attemptAutologin()) {
      this.deferredLogin?.resolve(this.userApps!.userId);
      this.deferredLogin = undefined;
      return { connectorId: `proceed-to-launcher`,  entrypoint: `not-set` };
    }
    this.userApps.setStartupAppProcess(
      this.instantiateStartupApp(deferredComponent.resolve, enableAutologin, saveUserKey)
    )
    .then(async ({ init }) => {
      const coreInitialized = await init;
      if (coreInitialized) {
        await this.userApps!.doUserSystemStartup(true);
        this.userApps!.closeStartupApp();
        this.deferredLogin?.resolve(this.userApps!.userId);
        this.deferredLogin = undefined;
      } else {
        console.error(`Core initialization returns false`);
        this.userApps = undefined;
      }
      const keyForAutologin = getUserKeyForAutologin();
      if (keyForAutologin) {
        await saveUserKeyForAutologin({
          key: keyForAutologin,
          userId: toCanonicalAddress(this.userApps!.userId)
        }, this.logging.logError);
      }
    }).catch(err => {
      this.userApps = undefined;
      let errStr = `Login process fails:\n`;
      if (err.runtimeException) {
        console.error(errStr, err);
        errStr += JSON.stringify(err, null, 2);
      } else {
        errStr += `${err.message}\n${err.stack}`;
        console.error(errStr);
      }
      try {
        deferredComponent.reject(errStr);
      } catch (_err) {}
    });
    const { connectorId, entrypoint } = await deferredComponent.promise;
    return { connectorId, entrypoint };
	}

  private async attemptAutologin(): Promise<boolean> {
    if (!this.r.makeUserLogin) {
      return false;
    }
    const foundUsers = await lookForAutologinUsers(this.logging.logError);
    if (!foundUsers) {
      return false;
    }
    const { userId, key } = foundUsers[0];
    try {
      await this.userApps!.startCoreDirectlyFor(userId, key);
      this.userApps!.doUserSystemStartup(false).catch(err => console.error(err));
      return true;
    } catch (err) {
      return false;
    }
  }

  private async getSignedUserIdEventually(): Promise<string> {
    if (this.deferredLogin) {
      return await this.deferredLogin.promise;
    } else {
      return this.userApps!.userId;
    }
  }

	private instantiateStartupApp(
    resolveComponent: (c: ComponentForAndroidAccess) => void,
    setAutoLogin: SetAutoLogin, saveUserKey: (storageKey: Uint8Array) => void
  ) {
		return (startCore: CoreDriver['start']) => StartupAppInAndroid.instantiate(
			() => startCore(saveUserKey),
      w3n => {
        const { connectorId, setComponent } = this.connectors.connectStartupW3N(patchCAPs(
          w3n,
          {
            openInExternal: openExternalUrl
          } as DefaultProviderSite,
          setAutoLogin,
          this.r.caps.shell.scanUrlQR
        ));
        return {
          connectorId,
          setComponent: c => {
            setComponent(c);
            resolveComponent(c);
          }
        }
      }
		);
	}

  async launchAppFromAndroid(appDomain: string): Promise<{ connectorId: string; entrypoint: string; }> {
    if (appDomain === STARTUP_APP_DOMAIN) {
      if (!this.deferredLogin) {
        throw `Login has already been done in this single user setup`;
      }
      return await this.startLogin();
    } else {
      if (!this.apps) {
        throw `InitProc.apps is not set`;
      }
      return await this.apps.launchAppFromAndroid(appDomain);
    }
  }

  private getComponent(connectorId: string): ComponentForAndroidAccess|undefined {
    return this.connectors.getComponent(connectorId);
  }

  private removeComponentConnector(connectorId: string): void {
    const connector = this.connectors.removeConnector(connectorId);
    if (connector) {
      connector.close?.();
      connector.component?.close();
    }
  }

  private listObjPathInConnector(cId: string, objPath: string[]): string[]|null {
    const connector = this.connectors.getCoreSideConnector(cId);
    return connector.exposedServices.listObj(objPath);
  }

  private attachComponentPortToConnector(connectorId: string): Promise<void> {
    return this.connectors.attachToPort(connectorId);
  }

  notifyOnClosingIpcToCore(connectorId: string): void {
    this.connectors.disconnectAndRemove(connectorId);
  }

	private readonly platformCAP: web3n.system.platform.Platform = {
		getCurrentVersion: () => getCurrentVersion(this.platformVersion),
		wipeFromThisDevice: stub('platformCAP.wipeFromThisDevice for w3n.system.platform capability'),
	};

  private processURL(url: string): void {
    const { signupParams, systemCmd } = parse3NWebURL(url);
    if (this.userApps && systemCmd) {
      if (systemCmd.cmd) {
        this.handleSystemCmdCall(systemCmd);
      }
    }
  }

  private processURLBeforeLogin(url: string): string|undefined {
    if (this.userApps?.coreStarted) {
      throw `User is already initialized. This should be called before login.`;
    }
    const { signupParams, systemCmd } = parse3NWebURL(url);
    if (signupParams) {
      return btoa(JSON.stringify(signupParams));
    } else if (systemCmd) {
      this.deferredLogin?.promise.then(() => this.handleSystemCmdCall(systemCmd));
    }
  }

  private handleSystemCmdCall(systemCmd: CmdParams): void {
		let appDomain: string;
		if (systemCmd.cmd as SysCmd === 'add-contact') {
			appDomain = CONTACTS_APP_DOMAIN;
		} else {
			return;
		}
    this.userApps?.executeCommand(appDomain, systemCmd).catch(err => {
			console.error(err);
		});
  }

  exposeFnsToAndroid(): void {
    const initProc = this;

    /**
     * This should be called by Android side when it sets up message port to respective component.
     */
    function attachComponentPortToConnector({ connectorId }: ConnectorIdArgs): Promise<void> {
      return initProc.attachComponentPortToConnector(connectorId);
    }
    interface ConnectorIdArgs { connectorId: string; }
    const connectorIdArgsType = ProtoType.for<ConnectorIdArgs>(initPb.ConnectorIdArgs);
    fnsForAndroid.exposeFn(
      attachComponentPortToConnector,
      connectorIdArgsType,
      undefined
    );

    async function listObjPathInConnector({
      connectorId, objPath
    }: ConnectorAndObjPathArgs): Promise<StringArrayValue|undefined> {
      const lst = initProc.listObjPathInConnector(connectorId, objPath)!;
      if (lst) {
        return { values: lst };
      }
    }
    interface ConnectorAndObjPathArgs { connectorId: string; objPath: string[]; }
    fnsForAndroid.exposeFn(
      listObjPathInConnector,
      ProtoType.for<ConnectorAndObjPathArgs>(initPb.ConnectorAndObjPathArgs),
      stringArrayValueType
    );

    async function getSignedUserIdEventually(): Promise<StringValue> {
      return { value: await initProc.getSignedUserIdEventually() };
    }
    fnsForAndroid.exposeFn(
      getSignedUserIdEventually,
      undefined,
      stringValueType
    );

    interface AppDomainArgs { appDomain: string; }
    const appDomainArgsType = ProtoType.for<AppDomainArgs>(pb.AppDomainArgs)

    async function isBundledApp({ appDomain }: AppDomainArgs): Promise<BooleanValue> {
      return { value: isBundled(appDomain) };
    }
    fnsForAndroid.exposeFn(
      isBundledApp,
      appDomainArgsType,
      booleanValueType
    );

    /**
     * This should be called by Android side, when component has been closed in/from it's side.
     * @param connectorId 
     */
    async function onComponentClosedInAndroid({ connectorId }: ConnectorIdArgs): Promise<void> {
      const c = initProc.getComponent(connectorId);
      if (c) {
        initProc.removeComponentConnector(connectorId);
        c.close();
      }
    }
    interface ConnectorIdArgs { connectorId: string; }
    fnsForAndroid.exposeFn(
      onComponentClosedInAndroid,
      ProtoType.for<ConnectorIdArgs>(pb.ConnectorIdArgs),
      undefined
    );

    /**
     * This return file size as number in string, or undefined, when file is not found.
     * @param path in app folder of the app
     */
    async function getFileSizeInAppCodeFS({
      connectorId, path
    }: ConnectorAndPathArgs): Promise<IntValue> {
      const c = initProc.getComponent(connectorId);
      if (c) {
        const stats = await (c.appRoot as ReadonlyFS).stat(path).catch(rethrowDifferentFromNotFound);
        if (stats?.isFile && (typeof stats.size == 'number')) {
          return { value: stats.size! };
        } else {
          return { value: -1 };
        }
      } else {
        console.error(`connector ${connectorId} is not found to stat file ${path} in related app`);
        return { value: -1 };
      }
    }
    interface ConnectorAndPathArgs { connectorId: string; path: string; }
    fnsForAndroid.exposeFn(
      getFileSizeInAppCodeFS,
      ProtoType.for<ConnectorAndPathArgs>(pb.ConnectorAndPathArgs),
      intValueType
    );

    async function readBytesFromFileInAppCodeFS(
      { connectorId, path, start, end }: FileReadArgs
    ): Promise<Uint8Array|undefined> {
      const c = initProc.getComponent(connectorId);
      if (!c) {
        return;
      }
      return c.appRoot.readBytes(path, start, end).catch(rethrowDifferentFromNotFound);
    }
    interface FileReadArgs { connectorId: string; path: string; start: number; end: number; }
    fnsForAndroid.exposeFn(
      readBytesFromFileInAppCodeFS,
      ProtoType.for<FileReadArgs>(pb.FileReadArgs),
      undefined
    );

    async function launchAppFromAndroid({ appDomain }: AppDomainArgs): Promise<ConnectorIdAndEntrypoint> {
      return await initProc.launchAppFromAndroid(appDomain);
    }
    interface ConnectorIdAndEntrypoint { connectorId: string; entrypoint: string; }
    fnsForAndroid.exposeFn(
      launchAppFromAndroid,
      appDomainArgsType,
      ProtoType.for<ConnectorIdAndEntrypoint>(pb.ConnectorAndEntrypoint)
    );

    async function processURL({ url }: UrlArgs) {
      initProc.processURL(url);
    }
    interface UrlArgs { url: string }
    fnsForAndroid.exposeFn(
      processURL,
      ProtoType.for<UrlArgs>(initPb.UrlArgs),
      undefined
    );

    async function processURLBeforeLogin({ url }: UrlArgs): Promise<StringValue> {
      return { value: initProc.processURLBeforeLogin(url) ?? '' };
    }
    interface UrlArgs { url: string }
    fnsForAndroid.exposeFn(
      processURLBeforeLogin,
      ProtoType.for<UrlArgs>(initPb.UrlArgs),
      stringValueType
    );

    initProc.mounting.exposeMountedFsFnsToAndroid();

  }

}
Object.freeze(InitProc.prototype);
Object.freeze(InitProc);


function patchCAPs(
	w3n: web3n.startup.W3N, provider: DefaultProviderSite, setAutoLogin: SetAutoLogin,
  scanUrlQR: web3n.caps.startup.W3N['scanUrlQR']
): web3n.caps.startup.W3N {
	return {
		signIn: w3n.signIn,
		signUp: w3n.signUp,
		provider,
		enableAutoLogin: setAutoLogin,
    scanUrlQR
	};
}

function stub(fnName: string) {
  return () => {
    const err = new Error(`${fnName} needs implementation`);
    console.error(err);
    throw err;
  };
}

function rethrowDifferentFromNotFound(exc: FileException): undefined {
  if (exc.notFound) {
    return undefined;
  } else {
    throw exc;
  }
}
