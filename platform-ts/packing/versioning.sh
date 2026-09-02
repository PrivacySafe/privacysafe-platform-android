#!/bin/bash

get_from_json() {
	local json_file="$1"
	local url="$2"
	if [ -n "$json_file" ]
	then
		local json_str_src="
			fs.readFileSync('$json_file', { encoding: 'utf8' })
		"
	elif [ -n "$url" ]
	then
		local json_str_src="
			child_process.execSync('curl -s -f "$url"', { encoding: 'utf-8' })
		"
	else
		echo "Neither file nor url given for json" 1>&2
		return 1
	fi
	shift 2
	local fields=""
	for field in $@
	do
		fields="$fields['$field']"
	done
	node -e "
		const json = JSON.parse($json_str_src);
		const val = json$fields;
		if ((typeof val === 'string') && (val.length > 0)) {
			console.log(val);
		} else if (Array.isArray(val)) {
			console.log(val.join(' '));
		} else {
			throw new Error(
				\"Configuration json file has invalid field $fields\"
			);
		}
	" || return $?
}

get_from_json_file() {
	local json_file="$1"
	shift 1
	get_from_json "$json_file" "" $@ || return $?
}

get_from_remote_json() {
	local url="$1"
	shift 1
	get_from_json "" "$url" $@ || return $?
}

BASE_URL='https://3nsoft.com/downloads'

platform_url() {
	local brand="$1"
	echo "${BASE_URL}/${brand}/platform"
}

bundles_url() {
	local brand="$1"
	echo "${BASE_URL}/${brand}/bundles"
}

app_url() {
	local brand="$1"
	local app_domain="$2"
	echo "${BASE_URL}/${brand}/3nweb-apps/${app_domain}"
}

app_zip_url() {
	local brand="$1"
	local app_domain="$2"
	local version="$3"
	echo "$(app_url $brand $app_domain)/$version/${app_domain}-${version}.zip"
}

platform_src_zip_url() {
	local brand="$1"
	local version="$2"
	local os="$3"
	echo "$(platform_url $brand)/$version/${brand}-${version}-${os}-src.zip"
}

get_latest_version_in_channel() {
	local base_url="$1"
	local channel="$2"
	local latest_url="$base_url/$channel.latest"
	node -e "
		try {
			console.log(JSON.parse(child_process.execSync(
				'curl -s -f "$latest_url"', { encoding: 'utf-8' }
			)));
		} catch (err) {}
	" || return $?
}

get_platform_latest_version_in_channel() {
	local brand="$1"
	local channel="$2"
	get_latest_version_in_channel "$(platform_url $brand)" $channel || return $? 
}

get_app_latest_version_in_channel() {
	local brand="$1"
	local app_domain="$2"
	local channel="$3"
	get_latest_version_in_channel "$(app_url $brand $app_domain)" $channel || return $?
}

get_config_of() {
	local brand=$1
	local version="$2"
	local src_url="$(platform_url $brand)/$version/${brand}-${version}-linux-src.zip"
	local src_zip="$(mktemp)"
	local src_dir="$(mktemp -d)"
	curl --silent --show-error --fail --output $src_zip "$src_url"
	if [ $? != 0 ]
	then
		echo "Can't get linux source file from $src_url needed to get configuration of $brand version $version" 1>&2
		return -2
	fi
	unzip -q -d $src_dir $src_zip || return $?
	local conf_file="$(mktemp)"
	cat $src_dir/bundle/packing/configuration.json > $conf_file
	rm -rf $src_dir $src_zip
	echo $conf_file
}

get_latest_runtime_version() {
	local rt="$1"
	content_url="$BASE_URL/runtimes/$rt/latest/linux/x64/content.txt"
	local content_file="$(mktemp)"
	curl --silent --show-error --fail --output $content_file "$content_url"
	if [ $? != 0 ]
	then
		echo "Can't get latest $rt content for linux from $content_url to read runtime's version" 1>&2
		return -2
	fi
	local content="$(cat $content_file)"
	rm $content_file || return $?
	local not_found_value="version not found"
	local version="$(node -e "
		const c = \`$content\`;
		const start = '$rt version '
		const end = ' comes from zip at ';
		if (!c.startsWith(start) || (c.indexOf(end) < 0)) {
			console.log('$not_found_value');
		} else {
			console.log(c.substring(start.length, c.indexOf(end)).trim());
		}
	")"
	if [ "$version" == "$not_found_value" ]
	then
		echo "Couldn't parse content file to get version" 1>&2
		return -2
	else
		echo "$version"
	fi
}

set_version_in_package_jsons() {
	local bundle_version="$1"
	if [ -z "$bundle_version" ]
	then
		echo "No new version given in the argument"
		return 1
	fi
	node -e "
		let [ version, bundleVersion ] = '$bundle_version'.split('+');
		bundleVersion = parseInt(bundleVersion);
		if (isNaN(bundleVersion) || (bundleVersion > 999)) {
			throw 'Fail to parse bundle number from $bundle_version that is less than 1000';
		}
		version = version.split('.').map(n => parseInt(n));
		if (version.length !== 3) {
			throw 'Fail to parse platform semantic version from $bundle_version';
		}
		version.forEach(n => {
			if (isNaN(n)) {
				throw 'Fail to parse platform semantic version from $bundle_version';
			}
		});
		version[2] = version[2]*1000 + bundleVersion;
		version = version.join('.');
		console.log('Correcting version for this built from $bundle_version to '+version);
		const package = JSON.parse(
			fs.readFileSync('package.json', { encoding: 'utf8' })
		);
		package.version = version;
		const packageLock = JSON.parse(
			fs.readFileSync('package-lock.json', { encoding: 'utf8' })
		);
		packageLock.version = version;
		packageLock.packages[''].version = version;
		fs.writeFileSync(
			'package.json', JSON.stringify(package), { encoding: 'utf8' }
		);
		fs.writeFileSync(
			'package-lock.json', JSON.stringify(packageLock), { encoding: 'utf8' }
		);
	" || return $?
}

