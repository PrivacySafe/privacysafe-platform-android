/*
 Copyright (C) 2024 - 2025 3NSoft Inc.

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

declare namespace web3n.shell.commands {

	type StartAppWithParams = (
		appDomain: string|null, cmd: string, ...params: any[]
	) => Promise<void>;

	interface CmdParams{
		cmd: string;
		params: any[];
	}
	
	type GetStartedCmd = () => Promise<CmdParams|undefined>;

	type WatchStartCmds = (observer: Observer<CmdParams>) => (() => void);

	interface ShellCmdException extends RuntimeException {
		type: 'shell-command';
		appDomain: string;
		command: string;
		cmdNotAllowed?: true;
		cmdNotFound?: true;
		callerNotAllowed?: true;
	}

}
