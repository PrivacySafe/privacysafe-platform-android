#!/bin/bash

# Check that current directory is project's top level
if [ ! -d packing ] || [ ! -d ts-code ]
then echo "Can't run from $(pwd)" ; exit 1 ; fi

source packing/versioning.sh

brand="PrivacySafe"
channel="nightly"
versions_dir="dist/bundle.versions"

echo "---------- Task overview ----------------
This collects apps' versions info into $versions_dir to make $brand $channel bundle.
-----------------------------------------
"

platform_desktop_ver="$(
	get_platform_latest_version_in_channel $brand $channel || exit $?
)"
if [ -z "$platform_desktop_ver" ]
then
	echo "Got no latest version from $channel channel in $(platform_url $brand)/"
	exit 1
fi

conf_json=$(get_config_of $brand $platform_desktop_ver)

if [ -z "$conf_json" ]
then
	echo "Fail to get $brand configuration from desktop"
	exit -2
fi

rm -r $versions_dir 2> /dev/null
mkdir -p $versions_dir || exit $?
apps_dir="$versions_dir/apps"
mkdir $apps_dir || exit $?
app_packs_dir="$versions_dir/app-packs"
mkdir $app_packs_dir || exit $?

launcher_domain=$(get_from_json_file $conf_json launcher-app)
get_app_latest_version_in_channel $brand $launcher_domain $channel > $apps_dir/$launcher_domain || exit $?
echo $launcher_domain "->" $(cat $apps_dir/$launcher_domain)

startup_domain=$(get_from_json_file $conf_json startup-app)
get_app_latest_version_in_channel $brand $startup_domain $channel > $apps_dir/$startup_domain || exit $?
echo $startup_domain "->" $(cat $apps_dir/$startup_domain)

for app_domain in $(get_from_json_file $conf_json bundled-apps)
do
	get_app_latest_version_in_channel $brand $app_domain $channel > $apps_dir/$app_domain || exit $?
	echo $app_domain "->" $(cat $apps_dir/$app_domain)
done

for app_domain in $(get_from_json_file $conf_json bundled-app-packs)
do
	get_app_latest_version_in_channel $brand $app_domain $channel > $app_packs_dir/$app_domain || exit $?
	echo $app_domain "->" $(cat $app_packs_dir/$app_domain)
done
