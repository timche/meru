import { APP_TOOLBAR_HEIGHT } from "@/lib/constants";
import { XIcon } from "lucide-react";
import { useIsSettingsOpen } from "../lib/hooks";
import { ipcMain } from "../lib/ipc";
import { Accounts } from "./accounts";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";

export function AppMain() {
	const isSettingsOpen = useIsSettingsOpen();

	if (isSettingsOpen.data !== true) {
		return;
	}

	return (
		<ScrollArea className="flex-1">
			<div
				className="max-w-md mx-auto"
				style={{
					paddingTop: APP_TOOLBAR_HEIGHT,
					paddingBottom: APP_TOOLBAR_HEIGHT,
				}}
			>
				<Accounts />
			</div>
			<Button
				variant="ghost"
				size="icon"
				className="size-7 absolute top-1.5 right-2"
				onClick={() => {
					ipcMain.send("toggleIsSettingsOpen");
				}}
			>
				<XIcon />
			</Button>
		</ScrollArea>
	);
}
