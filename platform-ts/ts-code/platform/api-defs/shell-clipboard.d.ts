/*
 Copyright (C) 2025 - 2026 3NSoft Inc.

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


declare namespace web3n.shell.clipboard {

	interface Clipboard {

		/**
		 * Returns the content in the clipboard as plain text.
		 */
		readText(): Promise<string>;

		/**
		 * Writes the text into the clipboard as plain text.
		 * @param text 
		 */
		writeText(text: string): Promise<void>;

		/**
		 * Returns the content in the clipboard as markup.
		 */
		readHTML(): Promise<string>;

		/**
		 * Writes the markup into the clipboard.
		 * @param markup 
		 */
		writeHTML(markup: string): Promise<void>;

		/**
		 * Returns the content in the clipboard as RTF.
		 */
		readRTF(): Promise<string>;

		/**
		 * Writes the text into the clipboard in RTF.
		 * @param text 
		 */
		writeRTF(text: string): Promise<void>;

	}

}
