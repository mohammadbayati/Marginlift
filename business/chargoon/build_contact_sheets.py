from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parent


def build(folder: str, pattern: str, output: str, columns: int, width: int) -> None:
    thumbnails = []
    for path in sorted((ROOT / folder).glob(pattern)):
        image = Image.open(path).convert("RGB")
        height = round(image.height * width / image.width)
        image.thumbnail((width, height))

        canvas = Image.new("RGB", (width, height + 26), "white")
        canvas.paste(image, (0, 26))
        ImageDraw.Draw(canvas).text((8, 6), path.stem, fill="black")
        thumbnails.append(canvas)

    rows = (len(thumbnails) + columns - 1) // columns
    cell_width = max(image.width for image in thumbnails)
    cell_height = max(image.height for image in thumbnails)
    sheet = Image.new(
        "RGB",
        (columns * cell_width, rows * cell_height),
        (225, 228, 232),
    )
    for index, image in enumerate(thumbnails):
        sheet.paste(image, ((index % columns) * cell_width, (index // columns) * cell_height))
    sheet.save(ROOT / output)


build("qa-deck", "slide-*.png", "deck-contact.png", 4, 300)
build("qa-proposal", "page-*.png", "proposal-contact.png", 5, 220)
