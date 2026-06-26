// Read a text field from FormData. A form field can be a string or a File;
// this narrows to string so callers never stringify a File to "[object Object]".
export function getString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}
