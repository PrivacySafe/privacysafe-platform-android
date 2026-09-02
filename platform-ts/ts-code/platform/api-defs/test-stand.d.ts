/*
 Copyright (C) 2021 - 2022, 2025 3NSoft Inc.

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

declare namespace web3n.testing {

	interface CommonW3N extends web3n.caps.W3N {
		testStand: testing.TestStand;
	}

	interface StartupW3N extends web3n.caps.startup.W3N {
		testStand: testing.StartupTestStand;
	}

	interface StaticTestInfo {
		userNum: number;
		userId: string;
	}

	interface BasicTestStand {
		exitAll(): Promise<void>;
		record(type: TestRecordType, msg?: string): Promise<void>;
		log: caps.common.Logger;
	}

	interface TestStand extends BasicTestStand {
		staticTestInfo(): Promise<StaticTestInfo>;
		idOfTestUser(userNum: number): Promise<string>;

		/**
		 * Starts listening for test signals from test process, that should
		 * different from this one.
		 * @param observer 
		 * @param userNum identifies user that should be listen for test signals.
		 * Value undefined means this user.
		 * @param appDomain identifies app that should be listen for test signals.
		 * Value undefined means this app.
		 * @param component identifies app component that should be listen for
		 * test signals. Value undefined means this app component.
		 */
		observeMsgsFromOtherLocalTestProcess(
			observer: Observer<any>, userNum: number|undefined,
			appDomain: string|undefined, component: string|undefined
		): () => void;

		/**
		 * Sends test signal message to test process, that should different from
		 * this one.
		 * @param userNum identifies user that should be listen for test signals.
		 * Value undefined means this user.
		 * @param appDomain identifies app that should be listen for test signals.
		 * Value undefined means this app.
		 * @param component identifies app component that should be listen for
		 * test signals. Value undefined means this app component.
		 * @param msg is a test signal message content itself. It can be anything
		 * JSON-ifiable.
		 */
		sendMsgToOtherLocalTestProcess(
			userNum: number|undefined, appDomain: string|undefined,
			component: string|undefined, msg: any
		): Promise<void>;

		focusThisWindow?: () => Promise<void>;
	}

	type TestRecordType = 'tests-start' |
		'spec-pass' | 'spec-pending' | 'spec-fail' | 'suite-fail' |
		'tests-pass' | 'tests-fail';

	interface StartupTestStand extends BasicTestStand {
		staticTestInfo(): Promise<StaticTestInfo & {
			pass: string; signupToken?: string;
		}>;
	}

}

declare namespace web3n.testing.config {

	interface TestStandConfig {
		apps?: { [appDomain: string]: DevApp; };
		sites?: { [domain: string]: DevSite; };
		startupApp?: { domain: string; } & DevApp;
		users?: DevUser[];
		userCreds?: string;
	}
	
	interface DevUser {
		idTemplate: string;
		signupToken?: string;
		testStartup?: true;
	}

	interface DevApp {
		dir: string;
		url?: string;
		logRPC?: true;
		skipAutoLaunch?: true;
		launchComponent?: string;
		formFactor?: ui.FormFactor;
	}
	
	interface DevAppParams extends DevApp {
		manifest: caps.AppManifest;
	}

	interface DevSite {
		dir: string;
		url?: string;
		logRPC?: true;
	}
	
	interface DevSiteParams extends DevSite {
		manifest: caps.SiteManifest;
	}

	
	interface DevUserParams {
		userId: string;
		pass: string;
		userNum: number;
		signupToken?: string;
		testStartup?: true;
	}
	
}
