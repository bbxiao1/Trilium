import { renderTypstSvg } from "@triliumnext/typst";
import { useCallback } from "preact/hooks";

import { t } from "../../../services/i18n";
import SvgSplitEditor from "../helpers/SvgSplitEditor";
import { TypeWidgetProps } from "../type_widget";

export const TYPST_ATTACHMENT_TITLE = "typst-export.svg";

export default function Typst(props: TypeWidgetProps) {
    const renderSvg = useCallback(async (content: string) => {
        if (!content.trim()) {
            return "";
        }
        return renderTypstSvg(content, { textColor: getComputedStyle(document.body).color });
    }, []);

    return (
        <SvgSplitEditor
            attachmentTitle={TYPST_ATTACHMENT_TITLE}
            renderSvg={renderSvg}
            placeholder={t("editable_code.placeholder")}
            {...props}
        />
    );
}
